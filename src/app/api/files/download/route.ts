import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import fs from "fs/promises";
import { existsSync } from "fs";
import path from "path";
import prisma from "@/lib/prisma";
import { checkFolderAccess } from "@/lib/expiration";

export const dynamic = "force-dynamic";

/**
 * GET /api/files/download
 * Serves private files via verified signed download tokens (used by LocalDiskStorageProvider)
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = req.nextUrl;
    const key = searchParams.get("key");
    const exp = searchParams.get("exp");
    const name = searchParams.get("name") || "download";
    const sig = searchParams.get("sig");

    if (!key || !exp || !sig) {
      return NextResponse.json({ error: "Invalid download link parameters" }, { status: 400 });
    }

    // 1. Expiration check
    const expiresAt = parseInt(exp, 10);
    if (isNaN(expiresAt) || Math.floor(Date.now() / 1000) > expiresAt) {
      return NextResponse.json(
        { error: "This download link has expired. Please request a new download link." },
        { status: 410 }
      );
    }

    // 2. Cryptographic signature check
    const secretKey = process.env.AUTH_SECRET || "local-storage-signing-secret";
    const payload = `${key}:${exp}:${name}`;
    const expectedSig = crypto.createHmac("sha256", secretKey).update(payload).digest("hex");

    const sigBuf = Buffer.from(sig, "hex");
    const expectedBuf = Buffer.from(expectedSig, "hex");
    if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) {
      return NextResponse.json({ error: "Invalid or tampered download signature" }, { status: 403 });
    }

    // 2b. Lifecycle check at serve time: a valid signature is not enough if the
    // folder expired, was deleted, or the file was removed after the link was issued.
    const fileRecord = await prisma.file.findUnique({
      where: { storageKey: key },
      include: { folder: true },
    });
    if (!fileRecord || fileRecord.deletedAt) {
      return NextResponse.json({ error: "File not found or has been deleted" }, { status: 404 });
    }
    const access = await checkFolderAccess(fileRecord.folder);
    if (!access.ok) {
      return NextResponse.json({ error: access.error, code: access.code }, { status: access.status });
    }

    // 3. Prevent path traversal
    const safeKey = key.replace(/\.\./g, "").replace(/^\/+/, "");
    const baseDir = path.join(process.cwd(), ".storage_uploads");
    const filePath = path.join(baseDir, safeKey);

    if (!existsSync(filePath)) {
      return NextResponse.json({ error: "File not found on storage server" }, { status: 404 });
    }

    const fileBuffer = await fs.readFile(filePath);

    // Determine basic content type
    let contentType = "application/octet-stream";
    const ext = name.split(".").pop()?.toLowerCase();
    if (ext === "png") contentType = "image/png";
    else if (ext === "jpg" || ext === "jpeg") contentType = "image/jpeg";
    else if (ext === "pdf") contentType = "application/pdf";
    else if (ext === "zip") contentType = "application/zip";
    else if (ext === "mp4") contentType = "video/mp4";

    return new NextResponse(fileBuffer, {
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": `attachment; filename="${encodeURIComponent(name)}"`,
        "Content-Length": fileBuffer.length.toString(),
        "Cache-Control": "private, no-cache, no-store, must-revalidate",
      },
    });
  } catch (error) {
    console.error("[Download Error]:", error);
    return NextResponse.json({ error: "Failed to download file" }, { status: 500 });
  }
}
