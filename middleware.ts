import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { isValidBasicAuth } from "@/lib/security/basic-auth";

function unauthorizedResponse(): NextResponse {
  return new NextResponse("Authentication required", {
    status: 401,
    headers: {
      "WWW-Authenticate": 'Basic realm="Morgan Demo", charset="UTF-8"',
      "Cache-Control": "no-store",
      "X-Robots-Tag": "noindex, nofollow",
    },
  });
}

export function middleware(request: NextRequest): NextResponse {
  const expectedUsername = process.env.DEMO_USERNAME ?? "";
  const expectedPassword = process.env.DEMO_PASSWORD ?? "";

  // Auth gate is intentionally opt-in so local development works unchanged.
  if (!expectedUsername || !expectedPassword) {
    return NextResponse.next();
  }

  const authorizationHeader = request.headers.get("authorization");
  const isAuthorized = isValidBasicAuth({
    authorizationHeader,
    expectedUsername,
    expectedPassword,
  });

  if (!isAuthorized) {
    return unauthorizedResponse();
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    // Protect app and API routes while excluding Next internals and static assets.
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js|map|txt|xml)$).*)",
  ],
};
