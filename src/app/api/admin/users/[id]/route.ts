import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getAdminSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

interface RouteParams {
  params: { id: string };
}

/**
 * GET /api/admin/users/[id]
 * View detailed metadata for an individual user.
 * Security: NEVER returns passwordHash or authentication secrets.
 */
export async function GET(req: NextRequest, { params }: RouteParams) {
  try {
    const admin = await getAdminSession(req);
    if (!admin) {
      return NextResponse.json({ error: "Admin access required", code: "FORBIDDEN" }, { status: 403 });
    }

    const { id } = params;
    const user = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
        folders: {
          where: { deletedAt: null },
          orderBy: { createdAt: "desc" },
          select: {
            id: true,
            folderCode: true,
            folderName: true,
            status: true,
            visibility: true,
            totalSize: true,
            fileCount: true,
            expiresAt: true,
            createdAt: true,
          },
        },
      },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found", code: "NOT_FOUND" }, { status: 404 });
    }

    const totalStorage = user.folders.reduce((acc, f) => acc + BigInt(f.totalSize), BigInt(0));
    const totalFiles = user.folders.reduce((acc, f) => acc + f.fileCount, 0);

    return NextResponse.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        isActive: user.isActive,
        createdAt: user.createdAt.toISOString(),
        updatedAt: user.updatedAt.toISOString(),
        folderCount: user.folders.length,
        fileCount: totalFiles,
        storageBytes: totalStorage.toString(),
        folders: user.folders.map((f) => ({
          id: f.id,
          folderCode: f.folderCode,
          folderName: f.folderName,
          status: f.status,
          visibility: f.visibility,
          totalSize: f.totalSize.toString(),
          fileCount: f.fileCount,
          expiresAt: f.expiresAt.toISOString(),
          createdAt: f.createdAt.toISOString(),
        })),
      },
    });
  } catch (error) {
    console.error("[GET /api/admin/users/[id] Error]:", error);
    return NextResponse.json({ error: "Failed to load user details" }, { status: 500 });
  }
}

/**
 * PATCH /api/admin/users/[id]
 * Suspend or reactivate user account.
 * Logs an audit event for the action.
 */
export async function PATCH(req: NextRequest, { params }: RouteParams) {
  try {
    const admin = await getAdminSession(req);
    if (!admin) {
      return NextResponse.json({ error: "Admin access required", code: "FORBIDDEN" }, { status: 403 });
    }

    const { id } = params;

    // Prevent suspending self
    if (admin.userId === id) {
      return NextResponse.json(
        { error: "Action prohibited: You cannot suspend your own administrative account.", code: "SELF_SUSPENSION" },
        { status: 400 }
      );
    }

    const targetUser = await prisma.user.findUnique({
      where: { id },
      select: { id: true, email: true, name: true, role: true, isActive: true },
    });

    if (!targetUser) {
      return NextResponse.json({ error: "User not found", code: "NOT_FOUND" }, { status: 404 });
    }

    const body = await req.json().catch(() => ({}));
    const { isActive, reason } = body;

    if (typeof isActive !== "boolean") {
      return NextResponse.json({ error: "'isActive' boolean field is required" }, { status: 400 });
    }

    const updatedUser = await prisma.user.update({
      where: { id },
      data: { isActive },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        isActive: true,
        updatedAt: true,
      },
    });

    const action = isActive ? "USER_ACTIVATED" : "USER_SUSPENDED";
    const ipAddress = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "127.0.0.1";
    const userAgent = req.headers.get("user-agent") || null;

    // Audit log
    await prisma.auditLog.create({
      data: {
        userId: admin.userId,
        action,
        ipAddress,
        userAgent,
        metadata: JSON.stringify({
          targetUserId: targetUser.id,
          targetEmail: targetUser.email,
          previousState: targetUser.isActive,
          newState: isActive,
          reason: reason || (isActive ? "Admin reactivated account" : "Admin suspended abusive account"),
          performedBy: admin.email,
        }),
      },
    });

    return NextResponse.json({
      success: true,
      message: isActive ? `Account ${targetUser.email} reactivated.` : `Account ${targetUser.email} suspended.`,
      user: {
        ...updatedUser,
        updatedAt: updatedUser.updatedAt.toISOString(),
      },
    });
  } catch (error) {
    console.error("[PATCH /api/admin/users/[id] Error]:", error);
    return NextResponse.json({ error: "Failed to update user status" }, { status: 500 });
  }
}
