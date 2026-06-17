import { NextRequest, NextResponse } from 'next/server';
import { S3Client, PutObjectCommand,DeleteObjectCommand } from '@aws-sdk/client-s3';
import { query } from '@/lib/db';
import * as amqp from 'amqplib';
import crypto from 'crypto';
const s3 = new S3Client({
  region: process.env.S3_REGION || 'us-east-005',
  endpoint: process.env.S3_ENDPOINT,
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY!,
    secretAccessKey: process.env.S3_SECRET_KEY!,
  },
});

async function authenticateDaemon(request: NextRequest): Promise<string | null> {
  const authHeader = request.headers.get('authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;

  const rawToken = authHeader.split(' ')[1];
  
  // Hash the incoming token to compare it against the database
  const hashedToken = crypto.createHash('sha256').update(rawToken).digest('hex');

  const tokenRes = await query(
    `UPDATE device_tokens SET last_used_at = CURRENT_TIMESTAMP 
     WHERE token_hash = $1 RETURNING user_id`,
    [hashedToken]
  );

  if (tokenRes.rows.length === 0) return null;
  return tokenRes.rows[0].user_id; // Return the real, verified user ID
}
export async function DELETE(request: NextRequest) {
  try {
    // 1. Authenticate the Daemon
    const userId = await authenticateDaemon(request);
    if (!userId) return NextResponse.json({ error: 'Unauthorized or Invalid API Key' }, { status: 401 });

    // 2. Extract relative path
    const rawPath = request.headers.get('x-file-name');
    if (!rawPath) return NextResponse.json({ error: 'Missing file path' }, { status: 400 });
    
    const pathParts = rawPath.split('/');
    const filename = pathParts.pop() || rawPath;
    const dirPath = pathParts.join('/');
    
    // Find the folder ID
    const folderId = await ensureFolderExists(dirPath, userId);

    // 3. Find the exact file to delete
    // We use IS NOT DISTINCT FROM to safely handle the root folder (NULL)
    const fileRes = await query(
      `SELECT id FROM files WHERE user_id = $1 AND filename = $2 AND folder_id IS NOT DISTINCT FROM $3`,
      [userId, filename, folderId]
    );

    if (fileRes.rows.length === 0) {
      return NextResponse.json({ message: 'File already deleted or not found' }, { status: 200 });
    }
    const fileId = fileRes.rows[0].id;

    // 4. Get the chunk hashes BEFORE we delete the file
    const mappingRes = await query(
      `SELECT chunk_hash FROM file_chunk_mapping WHERE file_id = $1`,
      [fileId]
    );
    const chunkHashes = mappingRes.rows.map((row: any) => row.chunk_hash);

    // 5. Delete the File record (CASCADE automatically wipes the file_chunk_mapping rows!)
    await query(`DELETE FROM files WHERE id = $1`, [fileId]);

    // 6. GARBAGE COLLECTION: Find and delete orphaned chunks
    let bytesFreed = 0;
    
    for (const hash of chunkHashes) {
      // Check if any OTHER files are still using this exact chunk
      const usageRes = await query(
        `SELECT COUNT(*) FROM file_chunk_mapping WHERE chunk_hash = $1`, 
        [hash]
      );
      
      if (parseInt(usageRes.rows[0].count) === 0) {
        // ORPHAN DETECTED: Delete the binary from Backblaze B2
        await s3.send(new DeleteObjectCommand({
          Bucket: process.env.S3_BUCKET_NAME!,
          Key: `chunks/${hash}`
        }));

        // Wipes the chunk from the master deduplication table
        const chunkRes = await query(`DELETE FROM file_chunks WHERE hash = $1 RETURNING size`, [hash]);
        if (chunkRes.rows.length > 0) bytesFreed += chunkRes.rows[0].size;
      }
    }

    console.log(`[Garbage Collector] Deleted ${filename}. Freed ${bytesFreed} bytes in B2.`);
    return NextResponse.json({ success: true, freed: bytesFreed }, { status: 200 });

  } catch (error) {
    console.error('[API] Critical failure during deletion:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

// HELPER: Build the folder tree recursively in the database
async function ensureFolderExists(path: string, userId: string): Promise<string | null> {
  if (!path || path === '.' || path === '/') return null;
  
  const parts = path.split('/').filter(p => p.length > 0);
  if (parts.length === 0) return null;

  let currentParentId: string | null = null;

  for (const part of parts) {
    // PostgreSQL "IS NOT DISTINCT FROM" safely compares NULL parent_ids
    const checkRes = await query(
      `SELECT id FROM folders WHERE user_id = $1 AND name = $2 AND parent_id IS NOT DISTINCT FROM $3`,
      [userId, part, currentParentId]
    );

    if (checkRes.rows.length > 0) {
      currentParentId = checkRes.rows[0].id; // Folder exists, move deeper
    } else {
      // Folder doesn't exist, create it
      const insertRes = await query(
        `INSERT INTO folders (user_id, parent_id, name) VALUES ($1, $2, $3) RETURNING id`,
        [userId, currentParentId, part]
      );
      currentParentId = insertRes.rows[0].id;
    }
  }
  return currentParentId;
}

export async function POST(request: NextRequest) {
  try {
    const hash = request.nextUrl.searchParams.get('hash');
    if (!hash) return NextResponse.json({ error: 'Missing hash' }, { status: 400 });

    // 1. Authenticate the Daemon using the new helper
    const userId = await authenticateDaemon(request);
    if (!userId) return NextResponse.json({ error: 'Unauthorized or Invalid API Key' }, { status: 401 });

    // 2. Extract relative path and build folders
    const rawPath = request.headers.get('x-file-name') || `unknown_${hash.substring(0,6)}.bin`;
    const pathParts = rawPath.split('/');
    const filename = pathParts.pop() || rawPath; // Extract just the file name
    const dirPath = pathParts.join('/'); // Extract just the folder structure
    
    // Build the SQL folder tree and get the final folder ID
    const folderId = await ensureFolderExists(dirPath, userId);

    // 3. Read the binary data
    const buffer = Buffer.from(await request.arrayBuffer());

    // 4. Upload directly to Backblaze B2
    await s3.send(new PutObjectCommand({
      Bucket: process.env.S3_BUCKET_NAME!,
      Key: `chunks/${hash}`,
      Body: buffer,
    }));

    // 5. Register in PostgreSQL (Now includes the folder_id!)
    const fileRes = await query(
      `INSERT INTO files (user_id, folder_id, filename, total_size, status) 
       VALUES ($1, $2, $3, $4, 'UPLOADED') 
       RETURNING id`,
      [userId, folderId, filename, buffer.length]
    );
    const fileId = fileRes.rows[0].id;

    // 6. Register Chunk (MUST include 'size' to satisfy NOT NULL schema constraint)
    await query(
      `INSERT INTO file_chunks (hash, size) 
       VALUES ($1, $2) 
       ON CONFLICT (hash) DO NOTHING`,
      [hash, buffer.length]
    );

    // 7. Map the chunk
    await query(
      `INSERT INTO file_chunk_mapping (file_id, chunk_hash, chunk_index) VALUES ($1, $2, 0)`,
      [fileId, hash]
    );

    // 8. Wake up RabbitMQ
    const connection = await amqp.connect(process.env.CLOUDAMQP_URL!);
    const channel = await connection.createChannel();
    await channel.assertQueue('file-processing-queue', { durable: true });
    
    channel.sendToQueue('file-processing-queue', Buffer.from(JSON.stringify({ 
      fileId: fileId, 
      userId: userId 
    })));
    
    await channel.close();
    await connection.close();

    return NextResponse.json({ success: true }, { status: 200 });

  } catch (error) {
    console.error('[API] Critical failure during chunk ingest:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}