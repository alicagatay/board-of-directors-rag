import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

function unauthorizedResponse(): NextResponse {
  return new NextResponse("Authentication required", {
    status: 401,
    headers: {
      "WWW-Authenticate": 'Basic realm="Protected", charset="UTF-8"',
      "Cache-Control": "no-store",
    },
  });
}

function decodeBasicAuth(
  authHeader: string,
): { username: string; password: string } | null {
  if (!authHeader.toLowerCase().startsWith("basic ")) return null;

  const base64Credentials = authHeader.slice(6).trim();
  if (!base64Credentials) return null;

  try {
    const decoded = atob(base64Credentials);
    const separatorIndex = decoded.indexOf(":");
    if (separatorIndex === -1) return null;
    const username = decoded.slice(0, separatorIndex);
    const password = decoded.slice(separatorIndex + 1);
    return { username, password };
  } catch {
    return null;
  }
}

export function middleware(request: NextRequest): NextResponse {
  const configuredPassword = process.env.APP_PASSWORD;

  // In production, fail closed if the password isn't configured.
  // In development, allow through when not configured to avoid accidental lockouts.
  if (!configuredPassword) {
    return process.env.NODE_ENV === "production"
      ? unauthorizedResponse()
      : NextResponse.next();
  }

  const authHeader = request.headers.get("authorization");
  const credentials = authHeader ? decodeBasicAuth(authHeader) : null;
  if (!credentials) return unauthorizedResponse();

  if (credentials.password !== configuredPassword)
    return unauthorizedResponse();

  return NextResponse.next();
}

export const config = {
  matcher: [
    // Exclude Next.js internals and common public files.
    "/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml).*)",
  ],
};
