import { createHmac } from "node:crypto";
import { safeEqual } from "@/lib/security/encryption";

export function buildZoomValidationResponse(
  plainToken: string,
  secret = process.env.ZOOM_WEBHOOK_SECRET_TOKEN,
): { plainToken: string; encryptedToken: string } {
  if (!secret) {
    throw new Error("ZOOM_WEBHOOK_SECRET_TOKEN is required.");
  }

  return {
    plainToken,
    encryptedToken: createHmac("sha256", secret)
      .update(plainToken)
      .digest("hex"),
  };
}

export function verifyZoomWebhookSignature(input: {
  rawBody: string;
  timestamp: string | null;
  signature: string | null;
  secret?: string;
  now?: number;
}): boolean {
  const secret = input.secret ?? process.env.ZOOM_WEBHOOK_SECRET_TOKEN;
  if (!secret) return process.env.NODE_ENV !== "production";
  if (!input.timestamp || !input.signature) return false;

  const timestamp = Number(input.timestamp);
  const now = input.now ?? Date.now();
  if (!Number.isFinite(timestamp)) return false;
  if (Math.abs(now - timestamp * 1000) > 5 * 60 * 1000) return false;

  const message = `v0:${input.timestamp}:${input.rawBody}`;
  const expected = `v0=${createHmac("sha256", secret)
    .update(message)
    .digest("hex")}`;
  return safeEqual(expected, input.signature);
}
