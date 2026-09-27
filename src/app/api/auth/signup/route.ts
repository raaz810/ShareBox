import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import {
  hashPassword,
  createSessionToken,
  evaluatePasswordStrength,
  getSessionCookieOptions,
} from "@/lib/auth";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    if (!body) {
      return NextResponse.json(
        { success: false, message: "Invalid JSON request payload" },
        { status: 400 }
      );
    }

    const { name, email, password, confirmPassword, termsAccepted } = body;

    // 1. Validation: Required fields
    if (!name || typeof name !== "string" || name.trim().length < 2) {
      return NextResponse.json(
        { success: false, message: "Full name must be at least 2 characters long" },
        { status: 400 }
      );
    }

    if (!email || typeof email !== "string") {
      return NextResponse.json(
        { success: false, message: "A valid email address is required" },
        { status: 400 }
      );
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const normalizedEmail = email.trim().toLowerCase();
    if (!emailRegex.test(normalizedEmail)) {
      return NextResponse.json(
        { success: false, message: "Please provide a valid email format" },
        { status: 400 }
      );
    }

    if (!termsAccepted) {
      return NextResponse.json(
        { success: false, message: "You must agree to the Terms of Service and Privacy Policy" },
        { status: 400 }
      );
    }

    // 2. Validation: Passwords match
    if (password !== confirmPassword) {
      return NextResponse.json(
        { success: false, message: "Passwords do not match" },
        { status: 400 }
      );
    }

    // 3. Validation: Password strength
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

    // 4. Duplicate email detection
    const existingUser = await prisma.user.findUnique({
      where: { email: normalizedEmail },
    });

    if (existingUser) {
      return NextResponse.json(
        {
          success: false,
          message: "An account with this email address already exists. Please sign in instead.",
        },
        { status: 409 }
      );
    }

    // 5. Secure password hashing
    const passwordHash = await hashPassword(password);

    // 6. User creation in database
    const user = await prisma.user.create({
      data: {
        name: name.trim(),
        email: normalizedEmail,
        passwordHash,
        role: "USER",
        isActive: true,
      },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        createdAt: true,
      },
    });

    // 7. Generate session token & set HTTP-only cookie
    const token = await createSessionToken({
      userId: user.id,
      email: user.email,
      role: user.role,
      name: user.name,
    });

    const cookieOptions = getSessionCookieOptions(false);
    const response = NextResponse.json(
      {
        success: true,
        message: "Account registered successfully",
        user,
      },
      { status: 201 }
    );

    response.cookies.set({
      ...cookieOptions,
      value: token,
    });

    return response;
  } catch (error) {
    console.error("[Signup API Error]:", error);
    return NextResponse.json(
      { success: false, message: "An unexpected error occurred while creating your account" },
      { status: 500 }
    );
  }
}
