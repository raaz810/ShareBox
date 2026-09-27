import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { AUTH_COOKIE_NAME, verifySessionToken } from "@/lib/auth";
import { SETTING_KEYS } from "@/lib/expiration";

export const dynamic = "force-dynamic";

const DEFAULT_SETTINGS = [
  {
    key: "max_file_size_mb",
    value: "100",
    description: "Maximum individual standard file size in Megabytes (MB)",
    isPublic: true,
  },
  {
    key: "max_files_per_folder",
    value: "100",
    description: "Maximum number of files allowed in a single folder",
    isPublic: true,
  },
  {
    key: "max_folder_storage_mb",
    value: "2048",
    description: "Maximum total storage capacity in MB per folder",
    isPublic: true,
  },
  {
    key: "max_concurrent_uploads",
    value: "3",
    description: "Maximum parallel concurrent file uploads allowed",
    isPublic: true,
  },
  {
    key: "max_video_size_mb",
    value: "250",
    description: "Maximum video file size in Megabytes (MB)",
    isPublic: true,
  },
  {
    key: "guest_folder_lifespan_hours",
    value: "24",
    description: "Guest retention: maximum lifespan in hours for guest-created ephemeral folders",
    isPublic: true,
  },
  {
    key: "user_folder_lifespan_days",
    value: "15",
    description: "Registered retention: lifespan in days for registered user folders",
    isPublic: true,
  },
  {
    key: "supported_file_types",
    value: "image/jpeg, image/png, image/webp, image/gif, image/svg+xml, application/pdf, application/msword, application/vnd.openxmlformats-officedocument.wordprocessingml.document, text/plain, text/csv, video/mp4, video/webm, video/quicktime, application/zip, application/vnd.rar",
    description: "Supported file types: comma-separated list of allowed MIME types",
    isPublic: true,
  },
  {
    key: "guest_expiring_soon_hours",
    value: "2",
    description: "Guest folders show 'Expiring Soon' when this many hours (or fewer) remain",
    isPublic: true,
  },
  {
    key: "user_expiring_soon_hours",
    value: "24",
    description: "Registered folders show 'Expiring Soon' and get a warning email this many hours before expiry",
    isPublic: true,
  },
  {
    key: "expiry_warning_emails_enabled",
    value: "true",
    description: "Send expiry warning notifications to registered users",
    isPublic: false,
  },
  {
    key: "allow_guest_uploads",
    value: "true",
    description: "Enable guest folder creation and file uploads without account requirement",
    isPublic: true,
  },
];

/**
 * GET /api/admin/settings
 * List all system settings (seeds default if not present)
 */
export async function GET(req: NextRequest) {
  try {
    const token = req.cookies.get(AUTH_COOKIE_NAME)?.value;
    const session = token ? await verifySessionToken(token) : null;

    if (!session?.userId || session.role !== "ADMIN") {
      return NextResponse.json({ error: "Admin access required", code: "FORBIDDEN" }, { status: 403 });
    }

    let settings = await prisma.systemSetting.findMany({
      orderBy: { key: "asc" },
    });

    // Seed any missing defaults (also adds keys introduced after the first seed)
    const existingKeys = new Set(settings.map((s) => s.key));
    if (DEFAULT_SETTINGS.some((d) => !existingKeys.has(d.key))) {
      for (const def of DEFAULT_SETTINGS) {
        await prisma.systemSetting.upsert({
          where: { key: def.key },
          update: {},
          create: def,
        });
      }
      settings = await prisma.systemSetting.findMany({
        orderBy: { key: "asc" },
      });
    }

    return NextResponse.json({ success: true, settings });
  } catch (error) {
    console.error("[GET /api/admin/settings Error]:", error);
    return NextResponse.json({ error: "Failed to load system settings" }, { status: 500 });
  }
}

/**
 * PATCH /api/admin/settings
 * Update system settings key-value pairs
 */
export async function PATCH(req: NextRequest) {
  try {
    const token = req.cookies.get(AUTH_COOKIE_NAME)?.value;
    const session = token ? await verifySessionToken(token) : null;

    if (!session?.userId || session.role !== "ADMIN") {
      return NextResponse.json({ error: "Admin access required", code: "FORBIDDEN" }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const { updates } = body; // Array of { key, value }

    if (!Array.isArray(updates) || updates.length === 0) {
      return NextResponse.json({ error: "No updates provided" }, { status: 400 });
    }

    const POSITIVE_NUMBER_KEYS = [
      "max_file_size_mb",
      "max_files_per_folder",
      "max_folder_storage_mb",
      "max_concurrent_uploads",
      "max_video_size_mb",
      SETTING_KEYS.guestRetentionHours,
      SETTING_KEYS.userRetentionDays,
      SETTING_KEYS.guestExpiringSoonHours,
      SETTING_KEYS.userExpiringSoonHours,
    ] as string[];
    const BOOLEAN_KEYS = [SETTING_KEYS.expiryWarningEmails, "allow_guest_uploads"] as string[];
    const knownKeys = new Map(DEFAULT_SETTINGS.map((d) => [d.key, d]));

    // Validate everything before writing anything, so a bad value can't leave a half-applied update
    for (const item of updates) {
      if (!item || typeof item.key !== "string" || typeof item.value !== "string") {
        return NextResponse.json({ error: "Each update needs a string key and value" }, { status: 400 });
      }
      if (item.key === SETTING_KEYS.testClockOffsetSeconds) {
        return NextResponse.json({ error: "Use /api/dev/clock to change the test clock" }, { status: 400 });
      }
      if (!knownKeys.has(item.key)) {
        return NextResponse.json({ error: `Unknown setting: ${item.key}` }, { status: 400 });
      }
      const value = item.value.trim();
      if (POSITIVE_NUMBER_KEYS.includes(item.key)) {
        const n = Number(value);
        if (value === "" || !Number.isFinite(n) || n <= 0) {
          return NextResponse.json({ error: `${item.key} must be a positive number` }, { status: 400 });
        }
      }
      if (BOOLEAN_KEYS.includes(item.key) && value !== "true" && value !== "false") {
        return NextResponse.json({ error: `${item.key} must be "true" or "false"` }, { status: 400 });
      }
      if (item.key === "supported_file_types" && value.length === 0) {
        return NextResponse.json({ error: "supported_file_types cannot be empty" }, { status: 400 });
      }
    }

    // upsert: keys added in later releases may not have been seeded yet
    await prisma.$transaction(
      updates.map((item: { key: string; value: string }) =>
        prisma.systemSetting.upsert({
          where: { key: item.key },
          update: { value: item.value.trim() },
          create: { ...knownKeys.get(item.key)!, value: item.value.trim() },
        })
      )
    );

    // Log setting modification to audit trail
    await prisma.auditLog.create({
      data: {
        userId: session.userId,
        action: "SYSTEM_SETTINGS_UPDATED",
        metadata: JSON.stringify({ updatesCount: updates.length, keys: updates.map((u) => u.key) }),
      },
    }).catch(() => null);

    const refreshed = await prisma.systemSetting.findMany({
      orderBy: { key: "asc" },
    });

    return NextResponse.json({
      success: true,
      message: "Settings updated successfully",
      settings: refreshed,
    });
  } catch (error) {
    console.error("[PATCH /api/admin/settings Error]:", error);
    return NextResponse.json({ error: "Failed to update settings" }, { status: 500 });
  }
}
