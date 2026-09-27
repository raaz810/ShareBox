import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { AUTH_COOKIE_NAME, verifySessionToken } from "@/lib/auth";
import {
  getRetentionPolicy,
  getServerNow,
  getTestClockOffsetMs,
  isTestClockAllowed,
  setTestClockOffsetSeconds,
} from "@/lib/expiration";

export const dynamic = "force-dynamic";

/**
 * Dev-only test clock. Shifts the server's expiration clock so expiry and cleanup
 * can be exercised without waiting 24 hours / 15 days.
 *
 *   GET  /api/dev/clock                        -> current offset, server time, policy
 *   POST /api/dev/clock { advanceSeconds: 90000 } -> move forward (e.g. 25h)
 *   POST /api/dev/clock { offsetSeconds: 0 }      -> set absolute offset (0 = reset)
 *
 * Disabled in production unless ALLOW_TEST_CLOCK=true, and then admin-only.
 */
async function authorize(req: NextRequest): Promise<NextResponse | null> {
  if (!isTestClockAllowed()) {
    return NextResponse.json({ error: "Test clock is disabled in production" }, { status: 404 });
  }
  if (process.env.NODE_ENV === "production") {
    const token = req.cookies.get(AUTH_COOKIE_NAME)?.value;
    const session = token ? await verifySessionToken(token) : null;
    if (session?.role !== "ADMIN") {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 });
    }
  }
  return null;
}

async function snapshot() {
  const [offsetMs, now, policy] = await Promise.all([
    getTestClockOffsetMs(prisma),
    getServerNow(prisma),
    getRetentionPolicy(prisma),
  ]);
  return {
    offsetSeconds: offsetMs / 1000,
    realTime: new Date().toISOString(),
    serverTime: now.toISOString(),
    policy: {
      guestRetentionHours: policy.guestRetentionMs / 3600000,
      userRetentionDays: policy.userRetentionMs / 86400000,
      guestExpiringSoonHours: policy.guestExpiringSoonMs / 3600000,
      userExpiringSoonHours: policy.userExpiringSoonMs / 3600000,
    },
  };
}

export async function GET(req: NextRequest) {
  const denied = await authorize(req);
  if (denied) return denied;
  return NextResponse.json({ success: true, ...(await snapshot()) });
}

export async function POST(req: NextRequest) {
  const denied = await authorize(req);
  if (denied) return denied;

  const body = await req.json().catch(() => ({}));
  const current = (await getTestClockOffsetMs(prisma)) / 1000;

  let next: number;
  if (typeof body.offsetSeconds === "number" && Number.isFinite(body.offsetSeconds)) {
    next = body.offsetSeconds;
  } else if (typeof body.advanceSeconds === "number" && Number.isFinite(body.advanceSeconds)) {
    next = current + body.advanceSeconds;
  } else {
    return NextResponse.json({ error: "Provide offsetSeconds or advanceSeconds (number)" }, { status: 400 });
  }
  if (next < 0) {
    return NextResponse.json({ error: "The test clock can only be moved forward of real time" }, { status: 400 });
  }

  await setTestClockOffsetSeconds(next, prisma);
  return NextResponse.json({ success: true, ...(await snapshot()) });
}
