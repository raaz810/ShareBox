import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import {
  verifyPassword,
  createSessionToken,
  getSessionCookieOptions,
} from "@/lib/auth";
import { loginRateLimiter, getClientIp } from "@/lib/rate-limiter";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    if (!body) {
      return NextResponse.json(
        { success: false, message: "Invalid JSON request payload" },
        { status: 400 }
      );
    }

    const { email, password, rememberMe } = body;

    if (!email || !password) {
      return NextResponse.json(
        { success: false, message: "Email and password are required" },
        { status: 400 }
      );
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    const clientIp = getClientIp(req.headers);
    const rateLimitKey = `login:${clientIp}:${normalizedEmail}`;

    // 1. Rate Limiting Check (Brute-force protection)
    const rateCheck = loginRateLimiter.check(rateLimitKey);
    if (!rateCheck.allowed) {
      return NextResponse.json(
        {
          success: false,
          message: `Too many failed login attempts. Please wait ${rateCheck.retryAfterSeconds} seconds before trying again.`,
          retryAfterSeconds: rateCheck.retryAfterSeconds,
        },
        { status: 429 }
      );
    }

    // 2. Fetch user by email
    const user = await prisma.user.findUnique({
      where: { email: normalizedEmail },
    });

    if (!user) {
      const attempt = loginRateLimiter.recordFailure(rateLimitKey);
      return NextResponse.json(
        {
          success: false,
          message: "Invalid email or password",
          remainingAttempts: attempt.remaining,
        },
        { status: 401 }
      );
    }

    if (!user.isActive) {
      return NextResponse.json(
        {
          success: false,
          message: "This account has been deactivated. Please contact support.",
        },
        { status: 403 }
      );
    }

    // 3. Verify password hash
    const isPasswordValid = await verifyPassword(password, user.passwordHash);
    if (!isPasswordValid) {
      const attempt = loginRateLimiter.recordFailure(rateLimitKey);
      return NextResponse.json(
        {
          success: false,
          message: "Invalid email or password",
          remainingAttempts: attempt.remaining,
        },
        { status: 401 }
      );
    }

    // 4. Success: Clear rate limiting
    loginRateLimiter.clear(rateLimitKey);

    // 5. Generate session token & set HTTP-only cookie
    const isRememberMe = Boolean(rememberMe);
    const token = await createSessionToken(
      {
        userId: user.id,
        email: user.email,
        role: user.role,
        name: user.name,
      },
      isRememberMe
    );

    const safeUser = {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      createdAt: user.createdAt,
    };

    const cookieOptions = getSessionCookieOptions(isRememberMe);
    const response = NextResponse.json(
      {
        success: true,
        message: "Logged in successfully",
        user: safeUser,
      },
      { status: 200 }
    );

    response.cookies.set({
      ...cookieOptions,
      value: token,
    });

    return response;
  } catch (error) {
    console.error("[Login API Error]:", error);
    return NextResponse.json(
      { success: false, message: "An unexpected error occurred during login" },
      { status: 500 }
    );
  }
}
