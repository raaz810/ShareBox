import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { AUTH_COOKIE_NAME, verifySessionToken, verifyPassword } from "@/lib/auth";
import { checkFolderOwnership } from "@/lib/folder";
import { capSignedUrlTtl, checkFolderAccess } from "@/lib/expiration";
import { storageService } from "@/lib/storage";
import { FolderVisibility } from "@prisma/client";
import { Readable } from "stream";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface RouteParams {
  params: { fileId: string };
}

/**
 * GET /api/files/[fileId]/preview
 * Streams a file directly to the browser for inline preview (images, videos).
 * Only allowed for image/* and video/* mime types.
 */
export async function GET(req: NextRequest, { params }: RouteParams) {
  try {
    const { fileId } = params;
    if (!fileId) return NextResponse.json({ error: "File ID required" }, { status: 400 });

    const file = await prisma.file.findUnique({
      where: { id: fileId },
      include: { folder: true },
    });

    if (!file || file.deletedAt)
      return NextResponse.json({ error: "File not found" }, { status: 404 });

    const { folder } = file;
    const access = await checkFolderAccess(folder);
    if (!access.ok)
      return NextResponse.json({ error: access.error, code: access.code }, { status: access.status });

    // Only allow previewing images and videos
    const isPreviewable = file.mimeType.startsWith("image/") || file.mimeType.startsWith("video/");
    if (!isPreviewable)
      return NextResponse.json({ error: "Preview not available for this file type" }, { status: 415 });

    // Auth
    const token = req.cookies.get(AUTH_COOKIE_NAME)?.value;
    const session = token ? await verifySessionToken(token) : null;
    const rawGuestToken =
      req.headers.get("x-ownership-token") ||
      req.cookies.get(`sharebox_owner_${folder.folderCode}`)?.value || null;
    const isOwner = checkFolderOwnership(folder, session?.userId || null, rawGuestToken);

    // Private folder
    if (folder.visibility === FolderVisibility.PRIVATE && !isOwner)
      return NextResponse.json({ error: "Private folder" }, { status: 403 });

    // Password protected
    if (folder.visibility === FolderVisibility.PASSWORD_PROTECTED && folder.passwordHash && !isOwner) {
      const pw = req.headers.get("x-folder-password");
      if (!pw || !(await verifyPassword(pw, folder.passwordHash)))
        return NextResponse.json({ error: "Password required" }, { status: 401 });
    }

    // Get the file stream from storage
    const { stream, contentLength } = await storageService.getFile(file.storageKey);

    // Convert Node.js Readable to Web ReadableStream
    const nodeReadable = stream as Readable;
    const webStream = new ReadableStream({
      start(controller) {
        nodeReadable.on("data", (chunk: Buffer) => controller.enqueue(chunk));
        nodeReadable.on("end", () => controller.close());
        nodeReadable.on("error", (err) => controller.error(err));
      },
      cancel() {
        nodeReadable.destroy();
      },
    });

    const headers: Record<string, string> = {
      "Content-Type": file.mimeType,
      "Content-Disposition": `inline; filename="${encodeURIComponent(file.originalFileName)}"`,
      // Browser cache must not outlive the folder
      "Cache-Control": `private, max-age=${capSignedUrlTtl(300, access.expiration.remainingMs)}`,
      "X-Content-Type-Options": "nosniff",
    };

    if (contentLength && contentLength > 0) {
      headers["Content-Length"] = String(contentLength);
    }

    return new NextResponse(webStream, { headers });
  } catch (error) {
    console.error("[GET /api/files/[fileId]/preview]:", error);
    return NextResponse.json({ error: "Preview failed" }, { status: 500 });
  }
}
