import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { AUTH_COOKIE_NAME, verifySessionToken, hashToken } from "@/lib/auth";
import { getFolderShareUrl } from "@/lib/folder";
import { checkFolderAccess, computeExpiresAt, getRetentionPolicy } from "@/lib/expiration";

export const dynamic = "force-dynamic";

interface RouteParams {
  params: {
    code: string;
  };
}

/**
 * POST /api/folders/[code]/claim
 * Allows an authenticated user to claim a guest folder by proving guest ownership
 */
export async function POST(req: NextRequest, { params }: RouteParams) {
  try {
    const code = params.code?.toUpperCase().trim();
    if (!code) {
      return NextResponse.json({ error: "Folder code is required" }, { status: 400 });
    }

    // 1. Must be logged in to claim a folder into account
    const token = req.cookies.get(AUTH_COOKIE_NAME)?.value;
    const session = token ? await verifySessionToken(token) : null;

    if (!session?.userId) {
      return NextResponse.json(
        { error: "You must be signed in to claim this folder to your account", code: "AUTH_REQUIRED" },
        { status: 401 }
      );
    }

    // 2. Fetch folder
    const folder = await prisma.folder.findUnique({
      where: { folderCode: code },
    });

    if (!folder) {
      return NextResponse.json({ error: "Folder not found" }, { status: 404 });
    }

    const access = await checkFolderAccess(folder);
    if (!access.ok) {
      const error = access.code === "EXPIRED" ? "Cannot claim an expired folder" : "Cannot claim a deleted folder";
      return NextResponse.json({ error, code: access.code }, { status: access.status });
    }

    // 3. Folder must be a guest folder (unassigned)
    if (folder.userId) {
      if (folder.userId === session.userId) {
        return NextResponse.json({
          success: true,
          message: "You already own this folder",
          folder: {
            id: folder.id,
            folderCode: folder.folderCode,
            folderName: folder.folderName,
          },
        });
      }
      return NextResponse.json(
        { error: "This folder is already linked to another user account", code: "ALREADY_CLAIMED" },
        { status: 409 }
      );
    }

    // 4. Validate ownership proof: guest ownership token
    const body = await req.json().catch(() => ({}));
    const rawOwnershipToken =
      body.ownershipToken ||
      req.headers.get("x-ownership-token") ||
      req.cookies.get(`sharebox_owner_${code}`)?.value;

    if (!rawOwnershipToken || typeof rawOwnershipToken !== "string") {
      return NextResponse.json(
        {
          error: "Ownership token is required to claim this guest folder. Knowing the folder code alone does not grant ownership.",
          code: "MISSING_OWNERSHIP_TOKEN",
        },
        { status: 403 }
      );
    }

    const hashedProvidedToken = hashToken(rawOwnershipToken.trim());
    if (hashedProvidedToken !== folder.ownershipTokenHash) {
      return NextResponse.json(
        { error: "Invalid ownership token. Ownership verification failed.", code: "INVALID_OWNERSHIP_TOKEN" },
        { status: 403 }
      );
    }

    // 5. Claim folder: link to user and apply registered retention (createdAt + 15 days by default)
    const policy = await getRetentionPolicy(prisma);
    // Never shorten: if registered retention is configured below what the folder already has, keep it
    const registeredExpiry = computeExpiresAt(folder.createdAt, true, policy);
    const newExpiration = registeredExpiry > folder.expiresAt ? registeredExpiry : folder.expiresAt;

    const updatedFolder = await prisma.folder.update({
      where: { id: folder.id },
      data: {
        userId: session.userId,
        expiresAt: newExpiration,
        expiryWarningSentAt: null, // new lifetime => eligible for a fresh expiry warning
      },
    });

    // 6. Audit log
    const clientIp = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null;
    prisma.auditLog
      .create({
        data: {
          userId: session.userId,
          folderId: folder.id,
          action: "FOLDER_CLAIM",
          ipAddress: clientIp,
          userAgent: req.headers.get("user-agent") || null,
          metadata: JSON.stringify({
            folderCode: folder.folderCode,
            claimedBy: session.email,
            newExpiresAt: newExpiration.toISOString(),
          }),
        },
      })
      .catch(() => null);

    return NextResponse.json({
      success: true,
      message: "Folder successfully claimed and linked to your account! Expiration extended to 15 days.",
      folder: {
        id: updatedFolder.id,
        folderCode: updatedFolder.folderCode,
        folderName: updatedFolder.folderName,
        expiresAt: updatedFolder.expiresAt.toISOString(),
        shareUrl: getFolderShareUrl(updatedFolder.folderCode, req.nextUrl.origin),
        isRegistered: true,
        isOwner: true,
      },
    });
  } catch (error) {
    console.error("[POST /api/folders/[code]/claim Error]:", error);
    return NextResponse.json({ error: "Failed to claim folder" }, { status: 500 });
  }
}
