import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { AUTH_COOKIE_NAME, verifySessionToken, verifyPassword, hashPassword } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * GET /api/user/profile
 * Returns detailed profile and account statistics
 */
export async function GET(req: NextRequest) {
  try {
    const token = req.cookies.get(AUTH_COOKIE_NAME)?.value;
    const session = token ? await verifySessionToken(token) : null;

    if (!session?.userId) {
      return NextResponse.json(
        { error: "Authentication required", code: "UNAUTHORIZED" },
        { status: 401 }
      );
    }

    const user = await prisma.user.findUnique({
      where: { id: session.userId },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        isActive: true,
        createdAt: true,
      },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Aggregate storage & file/folder counts
    const [totalFolders, totalFiles, storageAgg] = await Promise.all([
      prisma.folder.count({
        where: { userId: user.id, deletedAt: null },
      }),
      prisma.file.count({
        where: { folder: { userId: user.id, deletedAt: null }, deletedAt: null },
      }),
      prisma.folder.aggregate({
        where: { userId: user.id, deletedAt: null },
        _sum: { totalSize: true },
      }),
    ]);

    const totalStorageBytes = storageAgg._sum.totalSize ? storageAgg._sum.totalSize.toString() : "0";
    const quotaBytes = (25 * 1024 * 1024 * 1024).toString(); // 25 GB quota

    return NextResponse.json({
      success: true,
      user,
      stats: {
        totalFolders,
        totalFiles,
        totalStorageBytes,
        quotaBytes,
      },
    });
  } catch (error) {
    console.error("[GET /api/user/profile Error]:", error);
    return NextResponse.json({ error: "Failed to load user profile" }, { status: 500 });
  }
}

/**
 * PATCH /api/user/profile
 * Updates account settings: display name and/or password
 */
export async function PATCH(req: NextRequest) {
  try {
    const token = req.cookies.get(AUTH_COOKIE_NAME)?.value;
    const session = token ? await verifySessionToken(token) : null;

    if (!session?.userId) {
      return NextResponse.json(
        { error: "Authentication required", code: "UNAUTHORIZED" },
        { status: 401 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const { name, currentPassword, newPassword } = body;

    const user = await prisma.user.findUnique({
      where: { id: session.userId },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const updateData: Prisma.UserUpdateInput = {};

    // 1. Update Display Name if provided
    if (name !== undefined) {
      if (typeof name !== "string") {
        return NextResponse.json({ error: "Name must be a string" }, { status: 400 });
      }
      const trimmed = name.trim();
      if (trimmed.length > 60) {
        return NextResponse.json({ error: "Name must be 60 characters or less" }, { status: 400 });
      }
      updateData.name = trimmed || null;
    }

    // 2. Update Password if provided
    if (newPassword) {
      if (!currentPassword) {
        return NextResponse.json(
          { error: "Current password is required to change password" },
          { status: 400 }
        );
      }

      if (typeof newPassword !== "string" || newPassword.length < 8) {
        return NextResponse.json(
          { error: "New password must be at least 8 characters long" },
          { status: 400 }
        );
      }

      const isCurrentCorrect = await verifyPassword(currentPassword, user.passwordHash);
      if (!isCurrentCorrect) {
        return NextResponse.json(
          { error: "Incorrect current password. Please try again." },
          { status: 400 }
        );
      }

      updateData.passwordHash = await hashPassword(newPassword);
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json({ error: "No update fields provided" }, { status: 400 });
    }

    const updatedUser = await prisma.user.update({
      where: { id: user.id },
      data: updateData,
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        createdAt: true,
      },
    });

    return NextResponse.json({
      success: true,
      message: "Account settings updated successfully",
      user: updatedUser,
    });
  } catch (error) {
    console.error("[PATCH /api/user/profile Error]:", error);
    return NextResponse.json({ error: "Failed to update profile" }, { status: 500 });
  }
}
