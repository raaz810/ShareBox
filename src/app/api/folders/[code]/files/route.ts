import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { AUTH_COOKIE_NAME, verifySessionToken, verifyPassword } from "@/lib/auth";
import { checkFolderOwnership } from "@/lib/folder";
import { checkFolderAccess } from "@/lib/expiration";
import { FolderVisibility } from "@prisma/client";

export const dynamic = "force-dynamic";

interface RouteParams {
  params: {
    code: string;
  };
}

/**
 * GET /api/folders/[code]/files
 * Retrieves the list of files in a folder with metadata (Requirement 4 & 16)
 */
export async function GET(req: NextRequest, { params }: RouteParams) {
  try {
    const code = params.code?.toUpperCase().trim();
    if (!code) {
      return NextResponse.json({ error: "Folder code is required" }, { status: 400 });
    }

    const folder = await prisma.folder.findUnique({
      where: { folderCode: code },
    });

    if (!folder) {
      return NextResponse.json({ error: "Folder not found" }, { status: 404 });
    }

    const access = await checkFolderAccess(folder);
    if (!access.ok) {
      return NextResponse.json({ error: access.error, code: access.code }, { status: access.status });
    }

    // Authorization
    const token = req.cookies.get(AUTH_COOKIE_NAME)?.value;
    const session = token ? await verifySessionToken(token) : null;
    const rawGuestToken =
      req.headers.get("x-ownership-token") ||
      req.cookies.get(`sharebox_owner_${code}`)?.value ||
      null;

    const isOwner = checkFolderOwnership(folder, session?.userId || null, rawGuestToken);

    // Private Folder check
    if (folder.visibility === FolderVisibility.PRIVATE && !isOwner) {
      return NextResponse.json({ error: "Private folder: Access denied" }, { status: 403 });
    }

    // Password Protected Folder check
    if (folder.visibility === FolderVisibility.PASSWORD_PROTECTED && folder.passwordHash && !isOwner) {
      const providedPassword =
        req.headers.get("x-folder-password") ||
        req.nextUrl.searchParams.get("password");

      if (!providedPassword || !(await verifyPassword(providedPassword, folder.passwordHash))) {
        return NextResponse.json(
          { error: "Password required to view folder files", requiresPassword: true },
          { status: 401 }
        );
      }
    }

    // Retrieve active files
    const files = await prisma.file.findMany({
      where: {
        folderId: folder.id,
        deletedAt: null,
      },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        originalFileName: true,
        mimeType: true,
        fileSize: true,
        checksum: true,
        uploadStatus: true,
        createdAt: true,
      },
    });

    const formattedFiles = files.map((f) => ({
      id: f.id,
      fileName: f.originalFileName,
      mimeType: f.mimeType,
      fileSize: f.fileSize.toString(),
      checksum: f.checksum,
      status: f.uploadStatus,
      createdAt: f.createdAt.toISOString(),
    }));

    return NextResponse.json({
      success: true,
      files: formattedFiles,
      allowDownload: folder.allowDownload,
      isOwner,
    });
  } catch (error) {
    console.error("[GET /api/folders/[code]/files Error]:", error);
    return NextResponse.json({ error: "Failed to list folder files" }, { status: 500 });
  }
}
