import { NextRequest, NextResponse } from "next/server";

export function proxy(request: NextRequest) {
  const nonce = btoa(crypto.randomUUID());
  const api = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
  const apiOrigin = api === "same-origin" ? "" : new URL(api).origin;
  const csp = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${process.env.NODE_ENV === "development" ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "img-src 'self' data: blob:",
    "font-src 'self' https://fonts.gstatic.com",
    `connect-src 'self' ${apiOrigin} https://*.googleapis.com https://*.firebaseio.com wss://*.firebaseio.com${process.env.NODE_ENV === "development" ? " ws: wss:" : ""}`,
    "frame-src 'self' https://*.firebaseapp.com https://accounts.google.com",
    "media-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join("; ");
  const headers = new Headers(request.headers);
  headers.set("x-nonce", nonce);
  headers.set("Content-Security-Policy", csp);
  const response = NextResponse.next({ request: { headers } });
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*opengraph-image).*)"],
};
