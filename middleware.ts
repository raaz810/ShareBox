import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";

const AUTH_COOKIE_NAME = "sharebox_session";
const DEFAULT_AUTH_SECRET = "sharebox-default-development-secret-key-32chars-min";
const AUTH_SECRET = process.env.AUTH_SECRET || DEFAULT_AUTH_SECRET;

function getSecretKey(): Uint8Array {
  return new TextEncoder().encode(AUTH_SECRET);
}

interface SessionPayload {
  userId: string;
  email: string;
  role: "USER" | "ADMIN";
  name?: string | null;
}

async function verifyToken(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecretKey());
    if (!payload.userId || !payload.email) return null;
    return {
      userId: payload.userId as string,
      email: payload.email as string,
      role: (payload.role as "USER" | "ADMIN") || "USER",
      name: (payload.name as string) || null,
    };
  } catch {
    return null;
  }
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  const token = req.cookies.get(AUTH_COOKIE_NAME)?.value;
  const session = token ? await verifyToken(token) : null;
  const isAuthenticated = Boolean(session);

  // Protected Routes
  const isDashboardRoute = pathname.startsWith("/dashboard");
  const isFoldersRoute = pathname.startsWith("/folders");
  const isProfileRoute = pathname.startsWith("/profile");
  const isAdminRoute = pathname.startsWith("/admin");
  const isProtectedRoute = isDashboardRoute || isFoldersRoute || isProfileRoute || isAdminRoute;

  // Guest-Only Auth Routes
  const isAuthRoute =
    pathname === "/login" ||
    pathname === "/signup" ||
    pathname === "/forgot-password" ||
    pathname === "/reset-password";

  // 1. If accessing a protected route without valid session -> redirect to /login
  if (isProtectedRoute && !isAuthenticated) {
    const loginUrl = new URL("/login", req.url);
    loginUrl.searchParams.set("callbackUrl", pathname + req.nextUrl.search);
    return NextResponse.redirect(loginUrl);
  }

  // 2. If accessing /admin with valid session but not ADMIN role -> redirect to /dashboard
  if (isAdminRoute && isAuthenticated && session?.role !== "ADMIN") {
    const dashboardUrl = new URL("/dashboard", req.url);
    dashboardUrl.searchParams.set("error", "unauthorized_admin");
    return NextResponse.redirect(dashboardUrl);
  }

  // 3. If accessing auth pages (/login, /signup, etc.) while ALREADY logged in -> redirect to /dashboard
  if (isAuthRoute && isAuthenticated) {
    return NextResponse.redirect(new URL("/dashboard", req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/folders/:path*",
    "/profile/:path*",
    "/admin/:path*",
    "/login",
    "/signup",
    "/forgot-password",
    "/reset-password",
  ],
};
