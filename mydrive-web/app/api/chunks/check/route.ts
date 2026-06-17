import { NextRequest, NextResponse } from 'next/server';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { query } from '@/lib/db'; 

const s3 = new S3Client({
  region: process.env.S3_REGION || 'us-east-1',
  endpoint: process.env.S3_ENDPOINT,
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY!,
    secretAccessKey: process.env.S3_SECRET_KEY!,
  },
});

export async function GET(request: NextRequest) {
  try {
   
    const searchParams = request.nextUrl.searchParams;
    const hash = searchParams.get('hash');


    if (!hash || hash.length !== 64 || !/^[a-f0-9]+$/i.test(hash)) {
      return NextResponse.json(
        { error: 'Invalid or missing chunk hash' }, 
        { status: 400 }
      );
    }


    const dbResult = await query(
      'SELECT 1 FROM file_chunks WHERE hash = $1 LIMIT 1',
      [hash]
    );

    if (dbResult.rowCount && dbResult.rowCount > 0) {
      return NextResponse.json({ exists: true });
    }

    const command = new PutObjectCommand({
      Bucket: process.env.S3_BUCKET_NAME!,
      Key: `chunks/${hash}`, 
      ContentType: 'application/octet-stream',
    });

    const uploadUrl = await getSignedUrl(s3, command, { expiresIn: 900 });

    return NextResponse.json({ 
      exists: false, 
      uploadUrl: uploadUrl 
    });

  } catch (error) {
    console.error('[API] Error in /chunks/check:', error);
    return NextResponse.json(
      { error: 'Internal Server Error' }, 
      { status: 500 }
    );
  }
}