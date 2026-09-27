import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { AUTH_COOKIE_NAME, verifySessionToken } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const token = req.cookies.get(AUTH_COOKIE_NAME)?.value;

    if (!token) {
      return NextResponse.json(
        { authenticated: false, user: null },
        { status: 200 }
      );
    }

    const payload = await verifySessionToken(token);
    if (!payload || !payload.userId) {
      // Invalidate invalid token
      const res = NextResponse.json(
        { authenticated: false, user: null },
        { status: 200 }
      );
      res.cookies.delete(AUTH_COOKIE_NAME);
      return res;
    }

    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        isActive: true,
        createdAt: true,
      },
    });

    if (!user || !user.isActive) {
      const res = NextResponse.json(
        { authenticated: false, user: null },
        { status: 200 }
      );
      res.cookies.delete(AUTH_COOKIE_NAME);
      return res;
    }

    return NextResponse.json(
      {
        authenticated: true,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          createdAt: user.createdAt,
        },
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("[Auth Me API Error]:", error);
    return NextResponse.json(
      { authenticated: false, user: null },
      { status: 500 }
    );
  }
}
