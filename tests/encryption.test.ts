import { describe, expect, it } from "vitest";
import {
  decryptSecret,
  encryptSecret,
  maskSecret,
} from "@/lib/security/encryption";

describe("API key encryption", () => {
  it("round-trips with the same context", () => {
    const encrypted = encryptSecret(
      "sk-test-secret-value",
      "account:key",
      "test-master-secret",
    );

    expect(encrypted).not.toContain("sk-test-secret-value");
    expect(
      decryptSecret(encrypted, "account:key", "test-master-secret"),
    ).toBe("sk-test-secret-value");
  });

  it("rejects a different account/key context", () => {
    const encrypted = encryptSecret(
      "sk-test-secret-value",
      "account-a:key",
      "test-master-secret",
    );

    expect(() =>
      decryptSecret(encrypted, "account-b:key", "test-master-secret"),
    ).toThrow();
  });

  it("shows only a bounded key hint", () => {
    expect(maskSecret("sk-1234567890abcd")).toBe("sk-...abcd");
  });
});
