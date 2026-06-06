import { buildTaskExtractionPrompt } from "@/lib/ai/prompt";
import { callAiProvider } from "@/lib/ai/providers";
import {
  DEFAULT_PROVIDER_ORDER,
  type AiProvider,
  type ExtractedTask,
  type TaskExtraction,
} from "@/lib/domain/types";
import { decryptSecret } from "@/lib/security/encryption";
import type { AppStore } from "@/lib/storage/store";

type Credential = {
  id: string;
  provider: AiProvider;
  apiKey: string;
  persistent: boolean;
};

export type ProviderAttempt = {
  provider: AiProvider;
  keyId: string;
  success: boolean;
  error?: string;
};

export type ExtractionResult = TaskExtraction & {
  provider: AiProvider;
  model: string;
  attempts: ProviderAttempt[];
};

export type ProviderCaller = typeof callAiProvider;

function environmentValues(...names: string[]): string[] {
  return [
    ...new Set(
      names
        .flatMap((name) => (process.env[name] ?? "").split(","))
        .map((value) => value.trim())
        .filter(Boolean),
    ),
  ];
}

function getEnvironmentCredentials(provider: AiProvider): Credential[] {
  const values =
    provider === "openai"
      ? environmentValues("OPENAI_API_KEYS", "OPENAI_API_KEY")
      : provider === "gemini"
        ? environmentValues("GEMINI_API_KEYS", "GEMINI_API_KEY")
        : environmentValues("ANTHROPIC_API_KEYS", "ANTHROPIC_API_KEY");

  return values.map((apiKey, index) => ({
    id: `env_${provider}_${index + 1}`,
    provider,
    apiKey,
    persistent: false,
  }));
}

async function getCredentials(
  accountId: string,
  provider: AiProvider,
  store: AppStore,
): Promise<Credential[]> {
  const stored: Credential[] = [];
  const records = (await store.listProviderKeys(accountId)).filter(
    (key) => key.provider === provider && key.enabled,
  );

  for (const key of records) {
    try {
      stored.push({
        id: key.id,
        provider,
        apiKey: decryptSecret(key.encryptedKey, `${accountId}:${key.id}`),
        persistent: true,
      });
    } catch {
      await store.recordProviderKeyResult(key.id, {
        success: false,
        error: "Failed to decrypt API key.",
      });
    }
  }

  return [...stored, ...getEnvironmentCredentials(provider)];
}

function getCurrentDate(): string {
  const timeZone = process.env.APP_TIME_ZONE || "UTC";
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function splitMeetingText(text: string, maximumLength = 14_000): string[] {
  if (text.length <= maximumLength) return [text];

  const paragraphs = text.split(/\n{2,}/);
  const chunks: string[] = [];
  let current = "";

  for (const paragraph of paragraphs) {
    if (paragraph.length > maximumLength) {
      if (current) {
        chunks.push(current);
        current = "";
      }
      for (let index = 0; index < paragraph.length; index += maximumLength) {
        chunks.push(paragraph.slice(index, index + maximumLength));
      }
      continue;
    }

    const candidate = current ? `${current}\n\n${paragraph}` : paragraph;
    if (candidate.length > maximumLength) {
      chunks.push(current);
      current = paragraph;
    } else {
      current = candidate;
    }
  }

  if (current) chunks.push(current);
  return chunks;
}

function normalizedTitle(value: string): string {
  return value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\s\p{P}\p{S}]+/gu, "");
}

function bigrams(value: string): Set<string> {
  const output = new Set<string>();
  for (let index = 0; index < value.length - 1; index += 1) {
    output.add(value.slice(index, index + 2));
  }
  return output;
}

function similarity(left: string, right: string): number {
  if (left === right) return 1;
  if (left.includes(right) || right.includes(left)) return 0.9;
  const leftSet = bigrams(left);
  const rightSet = bigrams(right);
  if (leftSet.size === 0 || rightSet.size === 0) return 0;
  const intersection = [...leftSet].filter((item) => rightSet.has(item)).length;
  const union = new Set([...leftSet, ...rightSet]).size;
  return intersection / union;
}

export function deduplicateTasks(tasks: ExtractedTask[]): ExtractedTask[] {
  const output: ExtractedTask[] = [];

  for (const task of tasks) {
    const normalized = normalizedTitle(task.title);
    const duplicate = output.find(
      (existing) =>
        (existing.assigneeName ?? "") === (task.assigneeName ?? "") &&
        similarity(normalizedTitle(existing.title), normalized) >= 0.72,
    );

    if (!duplicate) {
      output.push({ ...task });
      continue;
    }

    duplicate.confidence = Math.max(duplicate.confidence, task.confidence);
    if (task.description.length > duplicate.description.length) {
      duplicate.description = task.description;
    }
    if (task.evidence.length > duplicate.evidence.length) {
      duplicate.evidence = task.evidence;
    }
    duplicate.dueDate ??= task.dueDate;
    duplicate.assigneeEmail ??= task.assigneeEmail;
    duplicate.shouldCreateTask ||= task.shouldCreateTask;
  }

  return output.map((task, index) => ({
    ...task,
    tempId: `task_${index + 1}`,
  }));
}

async function runSingleChunk(input: {
  accountId: string;
  meetingText: string;
  language?: string;
  store: AppStore;
  providerCaller: ProviderCaller;
}): Promise<ExtractionResult> {
  const settings = await input.store.getAiSettings(input.accountId);
  const order =
    settings.providerOrder.length > 0
      ? settings.providerOrder
      : DEFAULT_PROVIDER_ORDER;
  const prompt = buildTaskExtractionPrompt({
    meetingText: input.meetingText,
    currentDate: getCurrentDate(),
    language: input.language,
  });
  const attempts: ProviderAttempt[] = [];

  for (const provider of order) {
    const credentials = await getCredentials(
      input.accountId,
      provider,
      input.store,
    );
    const model = settings.models[provider];

    for (const credential of credentials) {
      try {
        const timeout = Number(process.env.AI_REQUEST_TIMEOUT_MS || 45_000);
        const extraction = await input.providerCaller({
          provider,
          apiKey: credential.apiKey,
          model,
          system: prompt.system,
          user: prompt.user,
          signal: AbortSignal.timeout(timeout),
        });
        attempts.push({
          provider,
          keyId: credential.id,
          success: true,
        });
        if (credential.persistent) {
          await input.store.recordProviderKeyResult(credential.id, {
            success: true,
          });
        }
        return {
          ...extraction,
          provider,
          model,
          attempts,
        };
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Unknown provider error";
        attempts.push({
          provider,
          keyId: credential.id,
          success: false,
          error: message.slice(0, 300),
        });
        if (credential.persistent) {
          await input.store.recordProviderKeyResult(credential.id, {
            success: false,
            error: message,
          });
        }
      }
    }
  }

  const attemptedProviders = attempts.map((attempt) => attempt.provider);
  const missingProviders = order.filter(
    (provider) => !attemptedProviders.includes(provider),
  );
  const detail =
    attempts.length === 0
      ? `No API keys are configured for: ${missingProviders.join(", ")}`
      : attempts
          .map(
            (attempt) =>
              `${attempt.provider}/${attempt.keyId}: ${attempt.error}`,
          )
          .join("; ");
  throw new Error(`All AI providers failed. ${detail}`);
}

export async function extractTasksWithFallback(input: {
  accountId: string;
  meetingText: string;
  language?: string;
  store: AppStore;
  providerCaller?: ProviderCaller;
}): Promise<ExtractionResult> {
  const chunks = splitMeetingText(input.meetingText.trim());
  const allTasks: ExtractedTask[] = [];
  const allExcluded: TaskExtraction["excludedItems"] = [];
  const allAttempts: ProviderAttempt[] = [];
  let successfulProvider: AiProvider = "openai";
  let successfulModel = "";

  for (const [index, chunk] of chunks.entries()) {
    const result = await runSingleChunk({
      ...input,
      meetingText:
        chunks.length === 1
          ? chunk
          : `[Part ${index + 1} of ${chunks.length}]\n${chunk}`,
      providerCaller: input.providerCaller ?? callAiProvider,
    });
    allTasks.push(...result.tasks);
    allExcluded.push(...result.excludedItems);
    allAttempts.push(...result.attempts);
    successfulProvider = result.provider;
    successfulModel = result.model;
  }

  const aliasMap = await input.store.getAliasMap(input.accountId);
  const mappedTasks = allTasks.map((task) => ({
    ...task,
    assigneeEmail:
      task.assigneeEmail ||
      (task.assigneeName ? aliasMap[task.assigneeName] || null : null),
  }));

  return {
    tasks: deduplicateTasks(mappedTasks),
    excludedItems: allExcluded,
    provider: successfulProvider,
    model: successfulModel,
    attempts: allAttempts,
  };
}
