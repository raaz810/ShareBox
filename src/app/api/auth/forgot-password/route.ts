import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { generateRandomToken, hashToken } from "@/lib/auth";
import { resetPasswordRateLimiter, getClientIp } from "@/lib/rate-limiter";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    if (!body || !body.email) {
      return NextResponse.json(
        { success: false, message: "Email address is required" },
        { status: 400 }
      );
    }

    const normalizedEmail = String(body.email).trim().toLowerCase();
    const clientIp = getClientIp(req.headers);
    const rateLimitKey = `reset:${clientIp}:${normalizedEmail}`;

    // Rate limiting check
    const rateCheck = resetPasswordRateLimiter.check(rateLimitKey);
    if (!rateCheck.allowed) {
      return NextResponse.json(
        {
          success: false,
          message: `Too many password reset requests. Please try again in ${rateCheck.retryAfterSeconds} seconds.`,
        },
        { status: 429 }
      );
    }

    resetPasswordRateLimiter.recordFailure(rateLimitKey);

    const user = await prisma.user.findUnique({
      where: { email: normalizedEmail },
    });

    // Uniform response to avoid account enumeration
    const genericResponse: Record<string, unknown> = {
      success: true,
      message:
        "If an account with this email exists, a password reset link has been dispatched.",
    };

    if (!user || !user.isActive) {
      return NextResponse.json(genericResponse, { status: 200 });
    }

    // Generate secure random token
    const plainToken = generateRandomToken(32);
    const tokenHash = hashToken(plainToken);
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour validity

    // Store hashed token in database
    await prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash,
        expiresAt,
      },
    });

    // In local development or testing, expose the test link so developer/tester can test directly
    if (process.env.NODE_ENV !== "production") {
      const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
      genericResponse.debug = {
        token: plainToken,
        resetUrl: `${appUrl}/reset-password?token=${plainToken}`,
        expiresAt: expiresAt.toISOString(),
      };
    }

    return NextResponse.json(genericResponse, { status: 200 });
  } catch (error) {
    console.error("[Forgot Password API Error]:", error);
    return NextResponse.json(
      { success: false, message: "An unexpected error occurred processing your request" },
      { status: 500 }
    );
  }
}
