import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { AUTH_COOKIE_NAME, verifySessionToken } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/audit-logs
 * List system audit trail entries with filtering and pagination
 */
export async function GET(req: NextRequest) {
  try {
    const token = req.cookies.get(AUTH_COOKIE_NAME)?.value;
    const session = token ? await verifySessionToken(token) : null;

    if (!session?.userId || session.role !== "ADMIN") {
      return NextResponse.json({ error: "Admin access required", code: "FORBIDDEN" }, { status: 403 });
    }

    const { searchParams } = req.nextUrl;
    const action = searchParams.get("action")?.trim() || "";
    const search = searchParams.get("search")?.trim() || "";
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "15", 10)));
    const skip = (page - 1) * limit;

    const where: Prisma.AuditLogWhereInput = {};

    if (action) {
      where.action = action;
    }

    if (search) {
      where.OR = [
        { action: { contains: search, mode: "insensitive" } },
        { ipAddress: { contains: search } },
        { metadata: { contains: search, mode: "insensitive" } },
        { user: { email: { contains: search, mode: "insensitive" } } },
        { folder: { folderCode: { contains: search.toUpperCase() } } },
      ];
    }

    const [total, logs] = await Promise.all([
      prisma.auditLog.count({ where }),
      prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
        include: {
          user: { select: { email: true, name: true, role: true } },
          folder: { select: { folderCode: true, folderName: true } },
        },
      }),
    ]);

    const formatted = logs.map((log) => ({
      id: log.id,
      action: log.action,
      userEmail: log.user?.email || null,
      userName: log.user?.name || null,
      folderCode: log.folder?.folderCode || null,
      folderName: log.folder?.folderName || null,
      ipAddress: log.ipAddress,
      userAgent: log.userAgent,
      metadata: log.metadata ? JSON.parse(log.metadata) : null,
      createdAt: log.createdAt.toISOString(),
    }));

    return NextResponse.json({
      success: true,
      logs: formatted,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit) || 1,
      },
    });
  } catch (error) {
    console.error("[GET /api/admin/audit-logs Error]:", error);
    return NextResponse.json({ error: "Failed to load audit logs" }, { status: 500 });
  }
}
