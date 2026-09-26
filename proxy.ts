import { NextResponse, type NextRequest } from 'next/server';
import { getPublicFrameOrigins } from './lib/deployments/engine';

/** Public assistants alone can be framed, and only by explicitly reviewed origins. */
export async function proxy(request: NextRequest) {
  const response = NextResponse.next();
  let ancestors = "'none'";
  const publicId = request.nextUrl.pathname.split('/')[2];
  if (publicId && /^[A-Za-z0-9_-]{8,120}$/.test(publicId)) {
    try { ancestors = ["'self'", ...await getPublicFrameOrigins(publicId)].join(' '); }
    catch { /* Unavailable or revoked assistants never gain embedding permission. */ }
  }
  response.headers.set('Content-Security-Policy', `frame-ancestors ${ancestors}`);
  response.headers.set('Cache-Control', 'no-store');
  response.headers.set('Referrer-Policy', 'no-referrer');
  return response;
}

export const config = { matcher: '/talk/:path*' };
