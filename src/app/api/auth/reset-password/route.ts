import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { hashPassword, hashToken, evaluatePasswordStrength } from "@/lib/auth";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    if (!body) {
      return NextResponse.json(
        { success: false, message: "Invalid JSON request payload" },
        { status: 400 }
      );
    }

    const { token, password, confirmPassword } = body;

    // 1. Validate inputs
    if (!token || typeof token !== "string" || token.trim().length === 0) {
      return NextResponse.json(
        { success: false, message: "Reset token is required" },
        { status: 400 }
      );
    }

    if (!password || !confirmPassword) {
      return NextResponse.json(
        { success: false, message: "Please provide and confirm your new password" },
        { status: 400 }
      );
    }

    if (password !== confirmPassword) {
      return NextResponse.json(
        { success: false, message: "Passwords do not match" },
        { status: 400 }
      );
    }

    // 2. Validate password strength
    const strength = evaluatePasswordStrength(password);
    if (!strength.isValid) {
      return NextResponse.json(
        {
          success: false,
          message: "Password does not meet complexity requirements",
          errors: strength.errors,
        },
        { status: 400 }
      );
    }

    // 3. Find token by SHA-256 hash
    const tokenHash = hashToken(token.trim());
    const resetRecord = await prisma.passwordResetToken.findUnique({
      where: { tokenHash },
      include: { user: true },
    });

    if (!resetRecord) {
      return NextResponse.json(
        {
          success: false,
          message: "Invalid or expired password reset token. Please request a new link.",
        },
        { status: 400 }
      );
    }

    if (resetRecord.usedAt !== null) {
      return NextResponse.json(
        {
          success: false,
          message: "This password reset token has already been used. Please request a new link.",
        },
        { status: 400 }
      );
    }

    if (new Date() > resetRecord.expiresAt) {
      return NextResponse.json(
        {
          success: false,
          message: "This password reset token has expired. Please request a new link.",
        },
        { status: 400 }
      );
    }

    if (!resetRecord.user || !resetRecord.user.isActive) {
      return NextResponse.json(
        {
          success: false,
          message: "Account associated with this reset token cannot be modified.",
        },
        { status: 400 }
      );
    }

    // 4. Hash new password
    const passwordHash = await hashPassword(password);

    // 5. Transaction: Update user password & mark token used
    await prisma.$transaction([
      prisma.user.update({
        where: { id: resetRecord.userId },
        data: { passwordHash },
      }),
      prisma.passwordResetToken.update({
        where: { id: resetRecord.id },
        data: { usedAt: new Date() },
      }),
    ]);

    return NextResponse.json(
      {
        success: true,
        message: "Your password has been successfully reset. You may now sign in.",
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("[Reset Password API Error]:", error);
    return NextResponse.json(
      { success: false, message: "An unexpected error occurred while resetting your password" },
      { status: 500 }
    );
  }
}
