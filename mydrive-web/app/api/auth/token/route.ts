import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { cookies } from 'next/headers';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';

export async function POST() {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get('auth_token')?.value;
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const decoded = jwt.verify(token, process.env.JWT_SECRET!) as { userId: string };
    const userId = decoded.userId;

    // Generate a secure random token string
    const rawToken = 'mdrive_sk_' + crypto.randomBytes(24).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');

    // Save the hashed variant to the database linked to this user
    await query(
      `INSERT INTO device_tokens (user_id, token_hash, device_name) VALUES ($1, $2, $3)`,
      [userId, tokenHash, 'Linux Desktop Daemon']
    );

    // Return the raw, unhashed string ONLY ONCE to the user
    return NextResponse.json({ token: rawToken }, { status: 200 });
  } catch (error) {
    console.error('[API Token Engine] Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}