import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { extractTasksWithFallback } from "@/lib/ai/extraction";
import { safeEqual } from "@/lib/security/encryption";
import { getStore } from "@/lib/storage/store";

export const runtime = "nodejs";

const requestSchema = z.object({
  accountId: z.string().min(1).default("local"),
  channelId: z.string().optional(),
  userId: z.string().optional(),
  meetingText: z.string().min(1).max(200_000),
  language: z.string().max(20).optional(),
});

function isAuthorized(request: NextRequest): boolean {
  const expected = process.env.INTERNAL_API_TOKEN;
  if (!expected) return process.env.NODE_ENV !== "production";
  const actual = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  return Boolean(actual && safeEqual(actual, expected));
}

export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = requestSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    const result = await extractTasksWithFallback({
      accountId: parsed.data.accountId,
      meetingText: parsed.data.meetingText,
      language: parsed.data.language,
      store: getStore(),
    });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Task extraction failed.",
      },
      { status: 502 },
    );
  }
}
