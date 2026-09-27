import crypto from "crypto";
import { Folder, PrismaClient } from "@prisma/client";
import { hashToken } from "@/lib/auth";

// Allowed characters for folder codes: uppercase alphanumeric, excluding ambiguous characters
// 32 characters: 2-9, A-Z (excluding 0, O, 1, I, L)
const CODE_CHARSET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
const CODE_LENGTH = 8;

/**
 * Generates a cryptographically secure random folder code.
 * Example format: "AB7K9X2P"
 */
export function generateRandomFolderCode(): string {
  const bytes = crypto.randomBytes(CODE_LENGTH);
  let code = "";
  for (let i = 0; i < CODE_LENGTH; i++) {
    // Uniform random selection from charset
    code += CODE_CHARSET[bytes[i] % CODE_CHARSET.length];
  }
  return code;
}

/**
 * Generates a unique folder code with database collision verification and retry.
 */
export async function generateUniqueFolderCode(prisma: PrismaClient, maxRetries = 10): Promise<string> {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const code = generateRandomFolderCode();
    const existing = await prisma.folder.findUnique({
      where: { folderCode: code },
      select: { id: true },
    });
    if (!existing) {
      return code;
    }
  }
  // Fallback with timestamp salt if multiple collisions occur
  const timestampSuffix = Date.now().toString(36).slice(-3).toUpperCase();
  return (generateRandomFolderCode().slice(0, 5) + timestampSuffix).slice(0, 8);
}

/**
 * Resolves full share URL for a given folder code.
 */
export function getFolderShareUrl(code: string, origin?: string | null): string {
  const baseUrl =
    origin ||
    process.env.NEXT_PUBLIC_APP_URL ||
    (typeof window !== "undefined" ? window.location.origin : "http://localhost:3000");

  const cleanBase = baseUrl.replace(/\/+$/, "");
  return `${cleanBase}/${code}`;
}

/**
 * Verifies if the requester owns the folder.
 * Registered owner: session.userId matches folder.userId
 * Guest owner: SHA-256(rawGuestToken) matches folder.ownershipTokenHash AND folder.userId === null
 */
export function checkFolderOwnership(
  folder: Pick<Folder, "userId" | "ownershipTokenHash">,
  sessionUserId?: string | null,
  rawGuestToken?: string | null
): boolean {
  // 1. Registered user matches folder.userId
  if (folder.userId && sessionUserId && folder.userId === sessionUserId) {
    return true;
  }

  // 2. Guest user: folder has no userId, and provided token hash matches
  if (!folder.userId && rawGuestToken) {
    const hashed = hashToken(rawGuestToken.trim());
    if (hashed === folder.ownershipTokenHash) {
      return true;
    }
  }

  return false;
}
