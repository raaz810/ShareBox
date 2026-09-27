import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { verifyPassword } from "@/lib/auth";
import { getFolderShareUrl } from "@/lib/folder";
import { checkFolderAccess, serializeExpiration } from "@/lib/expiration";

export const dynamic = "force-dynamic";

interface RouteParams {
  params: {
    code: string;
  };
}

/**
 * POST /api/folders/[code]/verify
 * Verify password for a password-protected folder
 */
export async function POST(req: NextRequest, { params }: RouteParams) {
  try {
    const code = params.code?.toUpperCase().trim();
    if (!code) {
      return NextResponse.json({ error: "Folder code is required" }, { status: 400 });
    }

    const body = await req.json().catch(() => ({}));
    const { password } = body;

    if (!password || typeof password !== "string") {
      return NextResponse.json({ error: "Password is required" }, { status: 400 });
    }

    const folder = await prisma.folder.findUnique({
      where: { folderCode: code },
      include: {
        user: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    if (!folder) {
      return NextResponse.json({ error: "Folder not found" }, { status: 404 });
    }

    const access = await checkFolderAccess(folder);
    if (!access.ok) {
      return NextResponse.json({ error: access.error, code: access.code }, { status: access.status });
    }

    if (!folder.passwordHash) {
      // Not password protected
      return NextResponse.json({ success: true, isUnlocked: true });
    }

    const isValid = await verifyPassword(password, folder.passwordHash);
    if (!isValid) {
      return NextResponse.json(
        { error: "Incorrect folder password. Please try again." },
        { status: 401 }
      );
    }

    const shareUrl = getFolderShareUrl(folder.folderCode, req.nextUrl.origin);

    return NextResponse.json({
      success: true,
      isUnlocked: true,
      folder: {
        id: folder.id,
        folderCode: folder.folderCode,
        folderName: folder.folderName,
        description: folder.description,
        visibility: folder.visibility,
        allowDownload: folder.allowDownload,
        hasPassword: true,
        fileCount: folder.fileCount,
        totalSizeBytes: folder.totalSize.toString(),
        createdAt: folder.createdAt.toISOString(),
        ...serializeExpiration(folder.expiresAt, access.now, access.expiration),
        shareUrl,
        isGuest: !folder.userId,
        isRegistered: Boolean(folder.userId),
        creatorName: folder.user?.name || (folder.userId ? "Registered User" : "Guest"),
      },
    });
  } catch (error) {
    console.error("[POST /api/folders/[code]/verify Error]:", error);
    return NextResponse.json({ error: "Failed to verify password" }, { status: 500 });
  }
}
