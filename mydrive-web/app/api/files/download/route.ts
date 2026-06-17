import { NextRequest, NextResponse } from 'next/server';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { query } from '@/lib/db';

const s3 = new S3Client({
  region: process.env.S3_REGION || 'us-east-005',
  endpoint: process.env.S3_ENDPOINT,
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY!,
    secretAccessKey: process.env.S3_SECRET_KEY!,
  },
});

export async function GET(request: NextRequest) {
  const fileId = request.nextUrl.searchParams.get('fileId');
  if (!fileId) return NextResponse.json({ error: 'Missing fileId' }, { status: 400 });

  try {
    // 1. Get file metadata
    const fileRes = await query(`SELECT filename, total_size FROM files WHERE id = $1`, [fileId]);
    if (fileRes.rows.length === 0) return NextResponse.json({ error: 'File not found' }, { status: 404 });
    const file = fileRes.rows[0];

    // 2. Get all chunk hashes for this file in strict sequential order
    const chunksRes = await query(
      `SELECT chunk_hash FROM file_chunk_mapping WHERE file_id = $1 ORDER BY chunk_index ASC`,
      [fileId]
    );

    // 3. Reassemble the file from Backblaze B2
    let fileBuffer = Buffer.alloc(0);
    for (const row of chunksRes.rows) {
      const s3Res = await s3.send(new GetObjectCommand({
        Bucket: process.env.S3_BUCKET_NAME!,
        Key: `chunks/${row.chunk_hash}`
      }));
      
      const chunkData = await s3Res.Body?.transformToByteArray();
      if (chunkData) {
        fileBuffer = Buffer.concat([fileBuffer, Buffer.from(chunkData)]);
      }
    }

    // 4. Format HTTP Headers to trigger a native browser download
    const headers = new Headers();
    headers.set('Content-Disposition', `attachment; filename="${file.filename}"`);
    headers.set('Content-Type', 'application/octet-stream');
    headers.set('Content-Length', file.total_size.toString());

    return new NextResponse(fileBuffer, { status: 200, headers });

  } catch (error) {
    console.error('[Download Engine] Critical failure:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}