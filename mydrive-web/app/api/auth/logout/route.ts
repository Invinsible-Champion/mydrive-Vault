import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';

export async function POST() {
  try {
    // Await the cookies instance (Next.js 15 requirement)
    const cookieStore = await cookies();
    
    // Delete the session cookie
    cookieStore.delete('auth_token');

    return NextResponse.json({ success: true, message: 'Logged out' }, { status: 200 });
  } catch (error) {
    console.error('[Logout Engine] Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}