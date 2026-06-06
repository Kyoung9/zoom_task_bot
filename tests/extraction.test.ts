import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  deduplicateTasks,
  extractTasksWithFallback,
} from "@/lib/ai/extraction";
import type { ExtractedTask } from "@/lib/domain/types";
import { encryptSecret, maskSecret } from "@/lib/security/encryption";
import {
  createProviderKeyId,
  MemoryStore,
} from "@/lib/storage/store";

function task(title: string): ExtractedTask {
  return {
    tempId: title,
    title,
    description: title,
    assigneeName: "Tanaka",
    assigneeEmail: null,
    dueDate: null,
    priority: "Medium",
    status: "To do",
    evidence: title,
    confidence: 0.8,
    shouldCreateTask: true,
  };
}

describe("AI fallback extraction", () => {
  const originalSecret = process.env.KEY_ENCRYPTION_SECRET;

  beforeEach(() => {
    process.env.KEY_ENCRYPTION_SECRET = "fallback-test-secret";
  });

  afterEach(() => {
    process.env.KEY_ENCRYPTION_SECRET = originalSecret;
  });

  it("tries all keys in priority order, then the next provider", async () => {
    const store = new MemoryStore();
    const addKey = async (
      provider: "openai" | "gemini",
      apiKey: string,
      priority: number,
    ) => {
      const id = createProviderKeyId();
      await store.addProviderKey({
        id,
        accountId: "account",
        provider,
        label: apiKey,
        encryptedKey: encryptSecret(apiKey, `account:${id}`),
        keyHint: maskSecret(apiKey),
        priority,
        registeredBy: "user",
      });
    };
    await addKey("openai", "openai-key-number-one", 10);
    await addKey("openai", "openai-key-number-two", 20);
    await addKey("gemini", "gemini-key-number-one", 10);

    const calls: string[] = [];
    const result = await extractTasksWithFallback({
      accountId: "account",
      meetingText: "Tanaka will check the API scope.",
      store,
      providerCaller: async (request) => {
        calls.push(`${request.provider}:${request.apiKey}`);
        if (request.provider === "openai") {
          throw new Error("OpenAI unavailable");
        }
        return {
          tasks: [task("Check API scope")],
          excludedItems: [],
        };
      },
    });

    expect(calls).toEqual([
      "openai:openai-key-number-one",
      "openai:openai-key-number-two",
      "gemini:gemini-key-number-one",
    ]);
    expect(result.provider).toBe("gemini");
    expect(result.tasks).toHaveLength(1);
  });

  it("merges highly similar tasks for the same assignee", () => {
    const result = deduplicateTasks([
      task("Check Zoom API permissions"),
      task("Check Zoom API permission"),
    ]);

    expect(result).toHaveLength(1);
    expect(result[0].tempId).toBe("task_1");
  });
});
