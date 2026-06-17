import { NextRequest, NextResponse } from 'next/server';
import { pool } from '@/lib/db';
import { getQueueChannel } from '@/lib/queue';

interface ChunkPayload {
  hash: string;
  size: number;
}

export async function POST(request: NextRequest) {
  const client = await pool.connect();

  try {
    const body = await request.json();
    const { file_id, user_id, chunks } = body as { file_id: string; user_id: string; chunks: ChunkPayload[] };

    if (!file_id || !user_id || !Array.isArray(chunks) || chunks.length === 0) {
      return NextResponse.json({ error: 'Malformed payload: file_id, user_id, and chunks array required' }, { status: 400 });
    }

    await client.query('BEGIN');

    const fileVerify = await client.query(
      'SELECT status FROM files WHERE id = $1 AND user_id = $2 FOR UPDATE',
      [file_id, user_id]
    );

    if (!fileVerify.rowCount || fileVerify.rowCount === 0) {
      await client.query('ROLLBACK');
      return NextResponse.json({ error: 'File entity modification unauthorized or missing' }, { status: 404 });
    }

    if (fileVerify.rows[0].status !== 'PENDING') {
      await client.query('ROLLBACK');
      return NextResponse.json({ error: 'File status is no longer in modifiable PENDING state' }, { status: 400 });
    }

    for (let index = 0; index < chunks.length; index++) {
      const { hash, size } = chunks[index];

      if (!hash || hash.length !== 64 || typeof size !== 'number') {
        await client.query('ROLLBACK');
        return NextResponse.json({ error: `Malformed hash profile or size metrics at position index: ${index}` }, { status: 400 });
      }

      await client.query(
        'INSERT INTO file_chunks (hash, size) VALUES ($1, $2) ON CONFLICT (hash) DO NOTHING',
        [hash, size]
      );

      await client.query(
        'INSERT INTO file_chunk_mapping (file_id, chunk_hash, chunk_index) VALUES ($1, $2, $3)',
        [file_id, hash, index]
      );
    }

    await client.query(
      "UPDATE files SET status = 'UPLOADED', updated_at = CURRENT_TIMESTAMP WHERE id = $1",
      [file_id]
    );

    await client.query('COMMIT');

    try {
      const channel = await getQueueChannel();
      const payload = JSON.stringify({
        fileId: file_id,
        userId: user_id,
        timestamp: new Date().toISOString()
      });

      channel.sendToQueue('file-processing-queue', Buffer.from(payload), {
        persistent: true 
      });
    } catch (queueError) {
      console.error('[CRITICAL] Database transaction committed but RabbitMQ payload broadcast failed:', queueError);
      return NextResponse.json({ 
        status: 'PARTIAL_SUCCESS', 
        message: 'Data securely mapped to cloud infrastructure. Post-processing background tasks delayed.' 
      }, { status: 202 });
    }

    return NextResponse.json({ status: 'SUCCESS', file_status: 'UPLOADED' }, { status: 200 });

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('[API] Transaction rolled back. Error in /files/commit:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  } finally {
    client.release();
  }
}