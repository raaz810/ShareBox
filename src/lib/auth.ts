import { SignJWT, jwtVerify } from "jose";
import bcrypt from "bcryptjs";
import crypto from "crypto";

export const AUTH_COOKIE_NAME = "sharebox_session";

const DEFAULT_AUTH_SECRET = "sharebox-default-development-secret-key-32chars-min";
const AUTH_SECRET = process.env.AUTH_SECRET || DEFAULT_AUTH_SECRET;

function getSecretKey(): Uint8Array {
  return new TextEncoder().encode(AUTH_SECRET);
}

export interface AuthUserPayload {
  userId: string;
  email: string;
  role: "USER" | "ADMIN";
  name?: string | null;
}

/**
 * Signs a JWT session token using jose (Edge and Node compatible).
 */
export async function createSessionToken(
  payload: AuthUserPayload,
  rememberMe: boolean = false
): Promise<string> {
  const expiration = rememberMe ? "30d" : "24h";

  return await new SignJWT({
    userId: payload.userId,
    email: payload.email,
    role: payload.role,
    name: payload.name ?? null,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(expiration)
    .sign(getSecretKey());
}

/**
 * Verifies and decodes a JWT session token.
 */
export async function verifySessionToken(token: string): Promise<AuthUserPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecretKey());
    if (!payload.userId || !payload.email) {
      return null;
    }
    return {
      userId: payload.userId as string,
      email: payload.email as string,
      role: (payload.role as "USER" | "ADMIN") || "USER",
      name: (payload.name as string) || null,
    };
  } catch {
    return null;
  }
}

/**
 * Helper to authenticate and authorize an admin user from a request.
 * Returns null if not authenticated or role is not ADMIN.
 */
export async function getAdminSession(req: {
  cookies: { get: (name: string) => { value: string } | undefined };
}): Promise<AuthUserPayload | null> {
  const token = req.cookies.get(AUTH_COOKIE_NAME)?.value;
  if (!token) return null;
  const session = await verifySessionToken(token);
  if (!session || session.role !== "ADMIN") return null;
  return session;
}

/**
 * Securely hashes a password using bcrypt.
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = await bcrypt.genSalt(12);
  return await bcrypt.hash(password, salt);
}

/**
 * Compares plain password with bcrypt hash.
 */
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return await bcrypt.compare(password, hash);
}

/**
 * Generates a cryptographically random token string.
 */
export function generateRandomToken(bytes: number = 32): string {
  return crypto.randomBytes(bytes).toString("hex");
}

/**
 * Computes a SHA-256 hash of a string (used for one-time reset tokens).
 */
export function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

/**
 * Cookie options for the HTTP-only session cookie.
 */
export function getSessionCookieOptions(rememberMe: boolean = false) {
  const maxAge = rememberMe ? 30 * 24 * 60 * 60 : 24 * 60 * 60; // 30 days vs 24 hours
  return {
    name: AUTH_COOKIE_NAME,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge,
  };
}

export interface PasswordStrengthResult {
  score: number; // 0 (weak) to 4 (strong)
  label: "Very Weak" | "Weak" | "Fair" | "Good" | "Strong";
  isValid: boolean;
  errors: string[];
}

/**
 * Evaluates password complexity and returns actionable feedback.
 */
export function evaluatePasswordStrength(password: string): PasswordStrengthResult {
  const errors: string[] = [];

  if (!password || password.length < 8) {
    errors.push("At least 8 characters long");
  }
  if (!/[A-Z]/.test(password)) {
    errors.push("At least one uppercase letter (A-Z)");
  }
  if (!/[a-z]/.test(password)) {
    errors.push("At least one lowercase letter (a-z)");
  }
  if (!/[0-9]/.test(password)) {
    errors.push("At least one number (0-9)");
  }
  if (!/[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(password)) {
    errors.push("At least one special character (e.g. !@#$%)");
  }

  let score = 0;
  if (password.length >= 8) score++;
  if (/[A-Z]/.test(password) && /[a-z]/.test(password)) score++;
  if (/[0-9]/.test(password)) score++;
  if (/[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(password)) score++;
  if (password.length >= 12 && score === 4) score = 4;

  const labels: Record<number, "Very Weak" | "Weak" | "Fair" | "Good" | "Strong"> = {
    0: "Very Weak",
    1: "Weak",
    2: "Fair",
    3: "Good",
    4: "Strong",
  };

  return {
    score,
    label: labels[score] || "Very Weak",
    isValid: errors.length === 0,
    errors,
  };
}
