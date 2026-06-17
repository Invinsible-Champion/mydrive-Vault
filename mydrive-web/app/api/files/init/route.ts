import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { filename, total_size, folder_id, user_id } = body;

    if (!filename || typeof filename !== 'string') {
      return NextResponse.json({ error: 'Valid filename is required' }, { status: 400 });
    }
    if (!total_size || typeof total_size !== 'number' || total_size <= 0) {
      return NextResponse.json({ error: 'Valid total size in bytes is required' }, { status: 400 });
    }
    if (!user_id || typeof user_id !== 'string') {
      return NextResponse.json({ error: 'Authenticated user_id is required' }, { status: 400 });
    }

    if (folder_id) {
      const folderCheck = await query(
        'SELECT 1 FROM folders WHERE id = $1 AND user_id = $2',
        [folder_id, user_id]
      );
      if (!folderCheck.rowCount || folderCheck.rowCount === 0) {
        return NextResponse.json({ error: 'Target directory not found or unauthorized' }, { status: 403 });
      }
    }

    const insertQuery = `
      INSERT INTO files (filename, total_size, folder_id, user_id, status)
      VALUES ($1, $2, $3, $4, 'PENDING')
      RETURNING id, status;
    `;
    
    const dbResult = await query(insertQuery, [
      filename,
      total_size,
      folder_id || null,
      user_id
    ]);

    const newFile = dbResult.rows[0];

    return NextResponse.json({
      file_id: newFile.id,
      status: newFile.status
    }, { status: 201 });

  } catch (error) {
    console.error('[API] Error in /files/init:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}