import { query } from '../../lib/db';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';

const s3 = new S3Client({
  region: process.env.S3_REGION || 'us-east-1',
  endpoint: process.env.S3_ENDPOINT,
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY!,
    secretAccessKey: process.env.S3_SECRET_KEY!,
  },
});

async function streamToBuffer(stream: any): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

function calculateEntropy(buffer: Buffer): number {
  if (buffer.length === 0) return 0;
  
  const frequencies = new Array(256).fill(0);
  for (let i = 0; i < buffer.length; i++) {
    frequencies[buffer[i]]++;
  }
  
  let entropy = 0;
  for (let i = 0; i < 256; i++) {
    if (frequencies[i] > 0) {
      const probability = frequencies[i] / buffer.length;
      entropy -= probability * Math.log2(probability);
    }
  }
  return entropy;
}

export async function processFilePipeline(fileId: string, userId: string): Promise<boolean> {
  console.log(`\n[Scanner] Initiating scan for File: ${fileId}`);

  try {
    const updateStart = await query(
      `UPDATE files SET status = 'SCANNING', updated_at = CURRENT_TIMESTAMP 
       WHERE id = $1 AND user_id = $2 RETURNING id`,
      [fileId, userId]
    );

    if ((updateStart.rowCount ?? 0) === 0) {
      console.error(`[Scanner] File ${fileId} not found or unauthorized.`);
      return false;
    }

    const mapping = await query(
      `SELECT chunk_hash FROM file_chunk_mapping 
       WHERE file_id = $1 ORDER BY chunk_index ASC LIMIT 5`, 
      [fileId]
    );

    if (mapping.rows.length === 0) {
      throw new Error('No physical chunks mapped to this file.');
    }

    console.log(`[Scanner] Downloading ${mapping.rows.length} chunks for heuristic analysis...`);

    let totalEntropy = 0;

    for (const row of mapping.rows) {
      const command = new GetObjectCommand({
        Bucket: process.env.S3_BUCKET_NAME!,
        Key: `chunks/${row.chunk_hash}`,
      });

      const response = await s3.send(command);
      const buffer = await streamToBuffer(response.Body);
      
      const chunkEntropy = calculateEntropy(buffer);
      totalEntropy += chunkEntropy;
    }

    const averageEntropy = totalEntropy / mapping.rows.length;
    console.log(`[Scanner] File Shannon Entropy calculated at: ${averageEntropy.toFixed(3)}`);

    if (averageEntropy > 7.95) {
      console.warn(`[Scanner] ⚠️ High entropy detected. Quarantining file ${fileId}.`);
      await query(
        `UPDATE files SET status = 'QUARANTINED', updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
        [fileId]
      );
      return true;
    }

    await query(
      `UPDATE files SET status = 'CLEAN', updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
      [fileId]
    );

    console.log(`[Scanner] ✓ File ${fileId} marked as CLEAN.`);
    return true;

  } catch (error) {
    console.error(`[Scanner] Critical failure processing file ${fileId}:`, error);
    await query(
      `UPDATE files SET status = 'QUARANTINED', updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
      [fileId]
    );
    throw error; 
  }
}