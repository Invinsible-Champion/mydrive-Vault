import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { S3Client, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { cookies } from 'next/headers';
import jwt from 'jsonwebtoken';
// Initialize S3 (if not already in this file)
const s3 = new S3Client({
  region: process.env.S3_REGION || 'us-east-005',
  endpoint: process.env.S3_ENDPOINT,
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY!,
    secretAccessKey: process.env.S3_SECRET_KEY!,
  },
});export async function DELETE(request: NextRequest) {
  const fileId = request.nextUrl.searchParams.get('fileId');
  if (!fileId) return NextResponse.json({ error: 'Missing fileId' }, { status: 400 });

  try {
    // 1. Get the chunk hashes AND the folder ID *BEFORE* we delete the file
    const fileRes = await query(`SELECT folder_id FROM files WHERE id = $1`, [fileId]);
    if (fileRes.rows.length === 0) return NextResponse.json({ error: 'File not found' }, { status: 404 });
    const startingFolderId = fileRes.rows[0].folder_id;

    const mappingRes = await query(
      `SELECT chunk_hash FROM file_chunk_mapping WHERE file_id = $1`,
      [fileId]
    );
    const chunkHashes = mappingRes.rows.map((row: any) => row.chunk_hash);

    // 2. Delete the File record (CASCADE automatically wipes the mappings)
    await query(`DELETE FROM files WHERE id = $1`, [fileId]);

    // 3. GARBAGE COLLECTION: Find and delete orphaned chunks in S3
    let bytesFreed = 0;
    for (const hash of chunkHashes) {
      const usageRes = await query(
        `SELECT COUNT(*) FROM file_chunk_mapping WHERE chunk_hash = $1`, 
        [hash]
      );
      
      if (parseInt(usageRes.rows[0].count) === 0) {
        await s3.send(new DeleteObjectCommand({
          Bucket: process.env.S3_BUCKET_NAME!,
          Key: `chunks/${hash}`
        }));

        const chunkRes = await query(`DELETE FROM file_chunks WHERE hash = $1 RETURNING size`, [hash]);
        if (chunkRes.rows.length > 0) bytesFreed += chunkRes.rows[0].size;
      }
    }

    // 4. NEW: FOLDER PRUNING (The Ghost Sweeper)
    let currentFolderId = startingFolderId;

    while (currentFolderId !== null) {
      // Check if folder has any remaining files or subfolders
      const filesCount = await query(`SELECT COUNT(*) FROM files WHERE folder_id = $1`, [currentFolderId]);
      const subfoldersCount = await query(`SELECT COUNT(*) FROM folders WHERE parent_id = $1`, [currentFolderId]);

      if (parseInt(filesCount.rows[0].count) === 0 && parseInt(subfoldersCount.rows[0].count) === 0) {
        // Get parent ID before deleting so we can walk up the tree
        const parentRes = await query(`SELECT parent_id FROM folders WHERE id = $1`, [currentFolderId]);
        const nextParentId = parentRes.rows.length > 0 ? parentRes.rows[0].parent_id : null;

        // Nuke the empty folder
        await query(`DELETE FROM folders WHERE id = $1`, [currentFolderId]);
        console.log(`[Auto-Pruner] Deleted empty folder ID: ${currentFolderId}`);

        // Move up to the next parent
        currentFolderId = nextParentId;
      } else {
        // Folder is no longer empty (it contains other files/folders), stop pruning!
        break;
      }
    }

    return NextResponse.json({ success: true, freed: bytesFreed }, { status: 200 });

  } catch (error) {
    console.error('[UI Delete Engine] Critical failure:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
export async function GET(request: NextRequest) {
  try {
    // 1. Extract and verify the secure HttpOnly cookie
    const cookieStore = await cookies();
    const token = cookieStore.get('auth_token')?.value;

    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // 2. Decode the JWT to get the verified userId
    const decoded = jwt.verify(token, process.env.JWT_SECRET!) as { userId: string };
    const userId = decoded.userId;

    // 3. Extract the folder path from the URL
    const folderId = request.nextUrl.searchParams.get('folderId');

    let foldersRes, filesRes;

    // 4. Bulletproof split logic to handle PostgreSQL NULLs perfectly
    if (folderId) {
      // User clicked into a specific folder
      foldersRes = await query(
        `SELECT id, name, created_at FROM folders WHERE user_id = $1 AND parent_id = $2 ORDER BY name ASC`,
        [userId, folderId]
      );
      filesRes = await query(
        `SELECT id, filename, total_size, status, created_at FROM files WHERE user_id = $1 AND folder_id = $2 ORDER BY filename ASC`,
        [userId, folderId]
      );
    } else {
      // User is at the "Home" root directory
      foldersRes = await query(
        `SELECT id, name, created_at FROM folders WHERE user_id = $1 AND parent_id IS NULL ORDER BY name ASC`,
        [userId]
      );
      filesRes = await query(
        `SELECT id, filename, total_size, status, created_at FROM files WHERE user_id = $1 AND folder_id IS NULL ORDER BY filename ASC`,
        [userId]
      );
    }

    return NextResponse.json({ 
      folders: foldersRes.rows, 
      files: filesRes.rows 
    }, { status: 200 });

  } catch (error) {
    console.error('[API] Error fetching files:', error);
    
    // Catch specific JWT errors (expired or invalid signatures)
    if (error instanceof jwt.JsonWebTokenError) {
      return NextResponse.json({ error: 'Invalid or expired session' }, { status: 401 });
    }
    
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}