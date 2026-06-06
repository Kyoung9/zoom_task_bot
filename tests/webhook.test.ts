import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  buildZoomValidationResponse,
  verifyZoomWebhookSignature,
} from "@/lib/zoom/webhook";

describe("Zoom webhook verification", () => {
  it("validates a current signed request", () => {
    const rawBody = '{"event":"bot_notification"}';
    const timestamp = "1700000000";
    const secret = "zoom-secret";
    const signature = `v0=${createHmac("sha256", secret)
      .update(`v0:${timestamp}:${rawBody}`)
      .digest("hex")}`;

    expect(
      verifyZoomWebhookSignature({
        rawBody,
        timestamp,
        signature,
        secret,
        now: Number(timestamp) * 1000,
      }),
    ).toBe(true);
  });

  it("rejects stale requests", () => {
    expect(
      verifyZoomWebhookSignature({
        rawBody: "{}",
        timestamp: "1",
        signature: "v0=invalid",
        secret: "zoom-secret",
        now: 1_000_000,
      }),
    ).toBe(false);
  });

  it("creates the URL validation token", () => {
    const result = buildZoomValidationResponse("plain", "zoom-secret");
    expect(result.plainToken).toBe("plain");
    expect(result.encryptedToken).toHaveLength(64);
  });
});
