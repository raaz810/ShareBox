import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { getAdminSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/users
 * List users with pagination, search, status filter, and aggregate metadata.
 * Security: NEVER returns passwordHash or authentication secrets.
 */
export async function GET(req: NextRequest) {
  try {
    const admin = await getAdminSession(req);
    if (!admin) {
      return NextResponse.json({ error: "Admin access required", code: "FORBIDDEN" }, { status: 403 });
    }

    const { searchParams } = req.nextUrl;
    const search = searchParams.get("search")?.trim() || "";
    const status = searchParams.get("status")?.trim().toLowerCase() || "all";
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "15", 10)));
    const skip = (page - 1) * limit;

    const where: Prisma.UserWhereInput = {};

    if (search) {
      where.OR = [
        { email: { contains: search, mode: "insensitive" } },
        { name: { contains: search, mode: "insensitive" } },
      ];
    }

    if (status === "active") {
      where.isActive = true;
    } else if (status === "suspended") {
      where.isActive = false;
    }

    const [total, users] = await Promise.all([
      prisma.user.count({ where }),
      prisma.user.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          isActive: true,
          createdAt: true,
          updatedAt: true,
          _count: {
            select: {
              folders: { where: { deletedAt: null } },
            },
          },
          folders: {
            where: { deletedAt: null },
            select: {
              totalSize: true,
              fileCount: true,
            },
          },
        },
      }),
    ]);

    const formattedUsers = users.map((u) => {
      const totalStorage = u.folders.reduce((acc, f) => acc + BigInt(f.totalSize), BigInt(0));
      const totalFiles = u.folders.reduce((acc, f) => acc + f.fileCount, 0);

      return {
        id: u.id,
        email: u.email,
        name: u.name,
        role: u.role,
        isActive: u.isActive,
        createdAt: u.createdAt.toISOString(),
        updatedAt: u.updatedAt.toISOString(),
        folderCount: u._count.folders,
        fileCount: totalFiles,
        storageBytes: totalStorage.toString(),
      };
    });

    return NextResponse.json({
      success: true,
      users: formattedUsers,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit) || 1,
      },
    });
  } catch (error) {
    console.error("[GET /api/admin/users Error]:", error);
    return NextResponse.json({ error: "Failed to load users" }, { status: 500 });
  }
}
