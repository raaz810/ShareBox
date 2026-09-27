import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { AUTH_COOKIE_NAME, verifySessionToken, verifyPassword } from "@/lib/auth";
import { checkFolderOwnership } from "@/lib/folder";
import { checkFolderAccess } from "@/lib/expiration";
import { storageService } from "@/lib/storage";
import { FolderVisibility } from "@prisma/client";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Inline minimal ZIP builder — no external deps, pure Node.js streams
// Uses the DEFLATE-stored (no compression) method for stream compatibility
function uint32LE(n: number): Buffer {
  const b = Buffer.alloc(4);
  b.writeUInt32LE(n >>> 0, 0);
  return b;
}
function uint16LE(n: number): Buffer {
  const b = Buffer.alloc(2);
  b.writeUInt16LE(n & 0xffff, 0);
  return b;
}

/**
 * Writes a single stored (uncompressed) file entry into the ZIP stream.
 * Returns the local file header + data Buffer and the central directory entry Buffer.
 */
function buildZipEntry(
  filename: string,
  data: Buffer,
  offset: number
): { local: Buffer; central: Buffer } {
  const filenameBytes = Buffer.from(filename, "utf8");
  const crc = crc32(data);
  const size = data.length;

  // Local file header
  const local = Buffer.concat([
    Buffer.from([0x50, 0x4b, 0x03, 0x04]), // signature
    uint16LE(20),      // version needed
    uint16LE(0x800),   // flags (UTF-8)
    uint16LE(0),       // compression: stored
    uint16LE(0),       // mod time
    uint16LE(0),       // mod date
    uint32LE(crc),     // CRC-32
    uint32LE(size),    // compressed size
    uint32LE(size),    // uncompressed size
    uint16LE(filenameBytes.length),
    uint16LE(0),       // extra field length
    filenameBytes,
    data,
  ]);

  // Central directory entry
  const central = Buffer.concat([
    Buffer.from([0x50, 0x4b, 0x01, 0x02]), // signature
    uint16LE(20),      // version made by
    uint16LE(20),      // version needed
    uint16LE(0x800),   // flags
    uint16LE(0),       // compression
    uint16LE(0),       // mod time
    uint16LE(0),       // mod date
    uint32LE(crc),
    uint32LE(size),
    uint32LE(size),
    uint16LE(filenameBytes.length),
    uint16LE(0),       // extra
    uint16LE(0),       // comment
    uint16LE(0),       // disk number start
    uint16LE(0),       // internal attrs
    uint32LE(0),       // external attrs
    uint32LE(offset),  // local header offset
    filenameBytes,
  ]);

  return { local, central };
}

// CRC-32 table
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[i] = c;
  }
  return table;
})();

function crc32(buf: Buffer): number {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) crc = CRC_TABLE[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

interface RouteParams {
  params: { code: string };
}

export async function GET(req: NextRequest, { params }: RouteParams) {
  try {
    const code = params.code?.toUpperCase().trim();
    if (!code) return NextResponse.json({ error: "Folder code required" }, { status: 400 });

    const folder = await prisma.folder.findUnique({
      where: { folderCode: code },
      include: { files: { where: { deletedAt: null }, orderBy: { createdAt: "asc" } } },
    });

    if (!folder) return NextResponse.json({ error: "Folder not found" }, { status: 404 });
    const access = await checkFolderAccess(folder);
    if (!access.ok) {
      return NextResponse.json({ error: access.error, code: access.code }, { status: access.status });
    }

    const token = req.cookies.get(AUTH_COOKIE_NAME)?.value;
    const session = token ? await verifySessionToken(token) : null;
    const guestToken =
      req.headers.get("x-ownership-token") ||
      req.cookies.get(`sharebox_owner_${code}`)?.value ||
      req.nextUrl.searchParams.get("token") || null;
    const isOwner = checkFolderOwnership(folder, session?.userId || null, guestToken);

    if (!folder.allowDownload && !isOwner)
      return NextResponse.json({ error: "Downloads disabled" }, { status: 403 });

    if (folder.visibility === FolderVisibility.PRIVATE && !isOwner)
      return NextResponse.json({ error: "Private folder" }, { status: 403 });

    if (folder.visibility === FolderVisibility.PASSWORD_PROTECTED && folder.passwordHash && !isOwner) {
      const pw = req.headers.get("x-folder-password") || req.nextUrl.searchParams.get("password");
      if (!pw || !(await verifyPassword(pw, folder.passwordHash)))
        return NextResponse.json({ error: "Password required" }, { status: 401 });
    }

    if (folder.files.length === 0)
      return NextResponse.json({ error: "No files to download" }, { status: 400 });

    // Build ZIP in memory (suitable for folders up to ~100MB)
    const centralDirs: Buffer[] = [];
    const localParts: Buffer[] = [];
    let offset = 0;
    const usedNames = new Set<string>();

    for (const file of folder.files) {
      try {
        const { stream } = await storageService.getFile(file.storageKey);
        const chunks: Buffer[] = [];
        for await (const chunk of stream as AsyncIterable<Buffer>) chunks.push(chunk);
        const data = Buffer.concat(chunks);

        let name = file.originalFileName;
        let counter = 1;
        while (usedNames.has(name)) {
          const parts = file.originalFileName.split(".");
          const ext = parts.length > 1 ? `.${parts.pop()}` : "";
          name = `${parts.join(".")}_(${counter++})${ext}`;
        }
        usedNames.add(name);

        const { local, central } = buildZipEntry(name, data, offset);
        localParts.push(local);
        centralDirs.push(central);
        offset += local.length;
      } catch (e) {
        console.warn(`Skipping ${file.originalFileName}:`, e);
      }
    }

    // End of central directory
    const centralSize = centralDirs.reduce((a, b) => a + b.length, 0);
    const eocd = Buffer.concat([
      Buffer.from([0x50, 0x4b, 0x05, 0x06]),
      uint16LE(0), uint16LE(0),
      uint16LE(centralDirs.length),
      uint16LE(centralDirs.length),
      uint32LE(centralSize),
      uint32LE(offset),
      uint16LE(0),
    ]);

    const zipBuffer = Buffer.concat([...localParts, ...centralDirs, eocd]);
    const safeZipName = folder.folderName.replace(/[<>:"/\\|?*]/g, "_").trim() || "ShareBox_Files";

    // Fire-and-forget audit log
    prisma.auditLog.create({
      data: {
        userId: session?.userId || null,
        folderId: folder.id,
        action: "FOLDER_DOWNLOAD_ZIP",
        ipAddress: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null,
        userAgent: req.headers.get("user-agent") || null,
        metadata: JSON.stringify({ folderCode: folder.folderCode, fileCount: folder.files.length }),
      },
    }).catch(() => null);

    return new NextResponse(zipBuffer, {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${encodeURIComponent(safeZipName)}.zip"`,
        "Content-Length": String(zipBuffer.length),
        "Cache-Control": "no-cache",
      },
    });
  } catch (error) {
    console.error("[GET /api/folders/[code]/download-zip]:", error);
    return NextResponse.json({ error: "Failed to create ZIP" }, { status: 500 });
  }
}
