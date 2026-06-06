import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { handleChatCommand } from "@/lib/chat/commands";
import { MemoryStore } from "@/lib/storage/store";

describe("AI chat commands", () => {
  const originalSecret = process.env.KEY_ENCRYPTION_SECRET;

  beforeEach(() => {
    process.env.KEY_ENCRYPTION_SECRET = "command-test-secret";
  });

  afterEach(() => {
    process.env.KEY_ENCRYPTION_SECRET = originalSecret;
  });

  it("requires direct messages for API key registration", async () => {
    const result = await handleChatCommand(
      "ai key add openai sk-this-is-a-long-test-key",
      {
        accountId: "account",
        userId: "user",
        isDirectMessage: false,
      },
      new MemoryStore(),
    );

    expect(result.handled).toBe(true);
    if (result.handled) {
      expect(result.text).toContain("direct message");
    }
  });

  it("stores multiple keys without echoing their plaintext", async () => {
    const store = new MemoryStore();
    const context = {
      accountId: "account",
      userId: "user",
      isDirectMessage: true,
    };
    const first = await handleChatCommand(
      "ai key add openai sk-first-long-secret alpha",
      context,
      store,
    );
    await handleChatCommand(
      "ai key add openai sk-second-long-secret beta",
      context,
      store,
    );

    expect((await store.listProviderKeys("account")).length).toBe(2);
    if (first.handled) {
      expect(first.text).not.toContain("sk-first-long-secret");
      expect(first.text).toContain("sk-...cret");
    }
  });

  it("updates provider fallback order and appends omitted providers", async () => {
    const store = new MemoryStore();
    await handleChatCommand(
      "ai priority set claude openai",
      {
        accountId: "account",
        userId: "user",
        isDirectMessage: true,
      },
      store,
    );

    expect((await store.getAiSettings("account")).providerOrder).toEqual([
      "claude",
      "openai",
      "gemini",
    ]);
  });
});
