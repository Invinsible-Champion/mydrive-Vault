import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function proxy(request: NextRequest) {
  // 1. Check if the user has the secure auth cookie
  const token = request.cookies.get('auth_token')?.value;

  // 2. Define public routes that don't require login
  const isAuthPage = request.nextUrl.pathname.startsWith('/login') || request.nextUrl.pathname.startsWith('/register');

  // 3. If they are on the root dashboard without a token, boot them to login
  if (!token && !isAuthPage && request.nextUrl.pathname === '/') {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  // 4. If they have a token and try to go to the login page, redirect to dashboard
  if (token && isAuthPage) {
    return NextResponse.redirect(new URL('/', request.url));
  }

  return NextResponse.next();
}

// Only run this middleware on specific routes to save performance
export const config = {
  matcher: ['/', '/login', '/register'],
};