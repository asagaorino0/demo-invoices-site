import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { normalizeWorkspaceKey, WORKSPACE_COOKIE_NAME } from './src/lib/workspace';

export function middleware(request: NextRequest) {
  const existingWorkspace = request.cookies.get(WORKSPACE_COOKIE_NAME)?.value;
  const requestedShopId = normalizeWorkspaceKey(request.nextUrl.searchParams.get('shopId') || '');
  const shouldAdoptShopWorkspace =
    requestedShopId &&
    (request.nextUrl.pathname === '/source-sheet' || request.nextUrl.pathname === '/api/google/auth');

  if (existingWorkspace && (!shouldAdoptShopWorkspace || existingWorkspace === requestedShopId)) {
    return NextResponse.next();
  }

  const response = NextResponse.next();
  response.cookies.set(WORKSPACE_COOKIE_NAME, shouldAdoptShopWorkspace ? requestedShopId : crypto.randomUUID(), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 24 * 365
  });
  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)']
};
