import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { processApprovalAction } from "@/lib/zoom/approval";
import { getStore } from "@/lib/storage/store";
import { safeEqual } from "@/lib/security/encryption";

export const runtime = "nodejs";

const requestSchema = z.object({
  approvalId: z.string().min(1),
  approvedBy: z.string().min(1),
  action: z.enum(["approve", "cancel"]).default("approve"),
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

  const result = await processApprovalAction({
    approvalId: parsed.data.approvalId,
    userId: parsed.data.approvedBy,
    action: parsed.data.action,
    store: getStore(),
  });
  return NextResponse.json(result, {
    status:
      result.kind === "forbidden"
        ? 403
        : result.kind === "unavailable"
          ? 409
          : 200,
  });
}
