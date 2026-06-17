import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import bcrypt from 'bcryptjs';

export async function POST(request: NextRequest) {
  try {
    const { username, email, password } = await request.json();

    if (!username || !email || !password) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // 1. Hash the password (Cost factor 12 is production standard)
    const salt = await bcrypt.genSalt(12);
    const passwordHash = await bcrypt.hash(password, salt);

    // 2. Insert into PostgreSQL
    const res = await query(
      `INSERT INTO users (username, email, password_hash) VALUES ($1, $2, $3) RETURNING id, username`,
      [username, email, passwordHash]
    );

    return NextResponse.json({ success: true, user: res.rows[0] }, { status: 201 });

  } catch (error: any) {
    console.error('[Register Engine] Error:', error);
    // Handle unique constraint violations (duplicate email/username)
    if (error.code === '23505') {
      return NextResponse.json({ error: 'Username or Email already exists' }, { status: 409 });
    }
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}