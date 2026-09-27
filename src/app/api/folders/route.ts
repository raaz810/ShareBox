import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { AUTH_COOKIE_NAME, verifySessionToken, generateRandomToken, hashToken, hashPassword } from "@/lib/auth";
import { generateUniqueFolderCode, getFolderShareUrl } from "@/lib/folder";
import {
  computeExpirationStatus,
  computeExpiresAt,
  getRetentionPolicy,
  getServerNow,
  serializeExpiration,
} from "@/lib/expiration";
import { FolderVisibility, Prisma } from "@prisma/client";

export const dynamic = "force-dynamic";

/**
 * POST /api/folders
 * Create a new folder (Supports both Guest and Authenticated Users)
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { folderName, description, password, allowDownload, visibility } = body;

    // Validation
    if (!folderName || typeof folderName !== "string" || folderName.trim().length === 0) {
      return NextResponse.json(
        { error: "Folder name is required and cannot be empty" },
        { status: 400 }
      );
    }

    if (folderName.trim().length > 100) {
      return NextResponse.json(
        { error: "Folder name must be less than 100 characters" },
        { status: 400 }
      );
    }

    if (description && typeof description === "string" && description.length > 1000) {
      return NextResponse.json(
        { error: "Description must be less than 1000 characters" },
        { status: 400 }
      );
    }

    // Check authentication
    const token = req.cookies.get(AUTH_COOKIE_NAME)?.value;
    const session = token ? await verifySessionToken(token) : null;
    const isRegistered = Boolean(session?.userId);
    const userId = session?.userId || null;

    // Password processing
    let passwordHash: string | null = null;
    let resolvedVisibility: FolderVisibility = FolderVisibility.PUBLIC;

    if (password && typeof password === "string" && password.trim().length > 0) {
      if (password.length < 4) {
        return NextResponse.json(
          { error: "Password must be at least 4 characters long" },
          { status: 400 }
        );
      }
      passwordHash = await hashPassword(password);
      resolvedVisibility = FolderVisibility.PASSWORD_PROTECTED;
    } else if (
      visibility === "PRIVATE" ||
      visibility === "PUBLIC" ||
      visibility === "PASSWORD_PROTECTED"
    ) {
      resolvedVisibility = visibility as FolderVisibility;
    }

    // Guest vs Registered setup
    let rawOwnershipToken: string | null = null;
    let ownershipTokenHash: string;

    if (!isRegistered) {
      // Guest folder: generate cryptographically secure ownership token
      rawOwnershipToken = generateRandomToken(32);
      // NEVER store raw token - store only its SHA-256 hash
      ownershipTokenHash = hashToken(rawOwnershipToken);
    } else {
      // Registered folder: user owns the folder via userId. Generate random hash for DB integrity
      ownershipTokenHash = hashToken(generateRandomToken(32));
    }

    // Expiration: expiresAt = createdAt + retention, both stamped from the server clock (UTC).
    // Guest: 24h, registered: 15 days by default; configurable via SystemSetting.
    // testLifespanSeconds is honoured only when the dev test clock is allowed.
    const policy = await getRetentionPolicy(prisma);
    const createdAt = await getServerNow(prisma);
    const testSeconds = body.testLifespanSeconds
      ? Math.max(5, parseInt(body.testLifespanSeconds, 10) || 0)
      : undefined;
    const expiresAt = computeExpiresAt(createdAt, isRegistered, policy, testSeconds);

    // Cryptographically secure random 8-character code (URL-safe, unique)
    const folderCode = await generateUniqueFolderCode(prisma);

    // Create folder record
    const folder = await prisma.folder.create({
      data: {
        userId,
        folderCode,
        folderName: folderName.trim(),
        description: description && typeof description === "string" ? description.trim() : null,
        ownershipTokenHash,
        passwordHash,
        visibility: resolvedVisibility,
        allowDownload: allowDownload !== undefined ? Boolean(allowDownload) : true,
        createdAt,
        expiresAt,
      },
    });

    // Optional audit log entry
    const clientIp = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null;
    const userAgent = req.headers.get("user-agent") || null;

    prisma.auditLog
      .create({
        data: {
          userId,
          folderId: folder.id,
          action: "FOLDER_CREATE",
          ipAddress: clientIp,
          userAgent,
          metadata: JSON.stringify({
            folderCode: folder.folderCode,
            isRegistered,
            visibility: folder.visibility,
            expiresAt: folder.expiresAt.toISOString(),
          }),
        },
      })
      .catch((err) => {
        console.error("Audit log error on folder create:", err);
      });

    const shareUrl = getFolderShareUrl(folder.folderCode, req.nextUrl.origin);

    return NextResponse.json(
      {
        success: true,
        folder: {
          id: folder.id,
          folderCode: folder.folderCode,
          folderName: folder.folderName,
          description: folder.description,
          visibility: folder.visibility,
          allowDownload: folder.allowDownload,
          hasPassword: Boolean(folder.passwordHash),
          createdAt: folder.createdAt.toISOString(),
          ...serializeExpiration(
            folder.expiresAt,
            createdAt,
            computeExpirationStatus(folder.expiresAt, createdAt, !isRegistered, policy)
          ),
          shareUrl,
          isRegistered,
          isOwner: true,
        },
        // Return raw ownership token ONLY for guests once at creation
        ownershipToken: rawOwnershipToken || undefined,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("[POST /api/folders Error]:", error);
    return NextResponse.json(
      { error: "An unexpected error occurred while creating the folder." },
      { status: 500 }
    );
  }
}

/**
 * GET /api/folders
 * List folders owned by the currently authenticated user with search, filter, sort, and pagination
 */
export async function GET(req: NextRequest) {
  try {
    const token = req.cookies.get(AUTH_COOKIE_NAME)?.value;
    const session = token ? await verifySessionToken(token) : null;

    if (!session?.userId) {
      return NextResponse.json(
        { error: "Authentication required to list account folders", code: "UNAUTHORIZED" },
        { status: 401 }
      );
    }

    const { searchParams } = req.nextUrl;
    const search = searchParams.get("search")?.trim() || "";
    const status = searchParams.get("status")?.toLowerCase() || "all"; // 'all' | 'active' | 'expired'
    const sortBy = searchParams.get("sortBy") || "createdAt"; // 'createdAt' | 'expiresAt' | 'folderName' | 'totalSize' | 'fileCount'
    const sortOrder = searchParams.get("sortOrder")?.toLowerCase() === "asc" ? "asc" : "desc";
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const limit = Math.min(50, Math.max(1, parseInt(searchParams.get("limit") || "9", 10)));
    const skip = (page - 1) * limit;

    const [now, policy] = await Promise.all([getServerNow(prisma), getRetentionPolicy(prisma)]);

    // Base filter: non-deleted folders of this user
    const where: Prisma.FolderWhereInput = {
      userId: session.userId,
      deletedAt: null,
    };

    // Status filter
    if (status === "active") {
      where.expiresAt = { gt: now };
    } else if (status === "expired") {
      where.expiresAt = { lte: now };
    }

    // Search filter (name or code)
    if (search) {
      where.OR = [
        { folderName: { contains: search, mode: "insensitive" } },
        { folderCode: { contains: search.toUpperCase() } },
        { description: { contains: search, mode: "insensitive" } },
      ];
    }

    // Sort order construction
    const orderBy: Prisma.FolderOrderByWithRelationInput = {};
    if (sortBy === "createdAt" || sortBy === "expiresAt" || sortBy === "folderName" || sortBy === "totalSize" || sortBy === "fileCount") {
      orderBy[sortBy] = sortOrder;
    } else {
      orderBy.createdAt = "desc";
    }

    // Fetch total matching count, active count, expired count, and paginated records
    const [totalMatching, folders, totalAll, totalActive, totalExpired] = await Promise.all([
      prisma.folder.count({ where }),
      prisma.folder.findMany({
        where,
        orderBy,
        skip,
        take: limit,
        select: {
          id: true,
          folderCode: true,
          folderName: true,
          description: true,
          visibility: true,
          allowDownload: true,
          createdAt: true,
          expiresAt: true,
          fileCount: true,
          totalSize: true,
          passwordHash: true,
        },
      }),
      prisma.folder.count({
        where: { userId: session.userId, deletedAt: null },
      }),
      prisma.folder.count({
        where: { userId: session.userId, deletedAt: null, expiresAt: { gt: now } },
      }),
      prisma.folder.count({
        where: { userId: session.userId, deletedAt: null, expiresAt: { lte: now } },
      }),
    ]);

    const formatted = folders.map((f) => ({
      id: f.id,
      folderCode: f.folderCode,
      folderName: f.folderName,
      description: f.description,
      visibility: f.visibility,
      allowDownload: f.allowDownload,
      hasPassword: Boolean(f.passwordHash),
      fileCount: f.fileCount,
      totalSizeBytes: f.totalSize.toString(),
      createdAt: f.createdAt.toISOString(),
      shareUrl: getFolderShareUrl(f.folderCode, req.nextUrl.origin),
      ...(() => {
        const exp = computeExpirationStatus(f.expiresAt, now, false, policy);
        return { ...serializeExpiration(f.expiresAt, now, exp), isExpired: exp.isExpired };
      })(),
    }));

    return NextResponse.json({
      success: true,
      folders: formatted,
      pagination: {
        total: totalMatching,
        page,
        limit,
        totalPages: Math.ceil(totalMatching / limit) || 1,
      },
      stats: {
        total: totalAll,
        active: totalActive,
        expired: totalExpired,
      },
    });
  } catch (error) {
    console.error("[GET /api/folders Error]:", error);
    return NextResponse.json(
      { error: "Failed to fetch folders" },
      { status: 500 }
    );
  }
}
