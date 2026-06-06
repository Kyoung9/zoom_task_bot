import {
  AI_PROVIDERS,
  DEFAULT_PROVIDER_ORDER,
  isAiProvider,
  type AiProvider,
} from "@/lib/domain/types";
import {
  encryptSecret,
  maskSecret,
} from "@/lib/security/encryption";
import {
  createProviderKeyId,
  type AppStore,
} from "@/lib/storage/store";

export type CommandContext = {
  accountId: string;
  userId: string;
  isDirectMessage: boolean;
};

export type CommandResult =
  | { handled: false }
  | { handled: true; text: string; sensitive?: boolean };

const HELP_TEXT = [
  "Meeting Task Bot commands",
  "",
  "AI configuration (direct message only):",
  "ai status",
  "ai key add <openai|gemini|claude> <api-key> [label]",
  "ai key list",
  "ai key remove <key-id-or-prefix>",
  "ai key enable|disable <key-id-or-prefix>",
  "ai key priority <key-id-or-prefix> <number>",
  "ai priority set <provider> <provider> <provider>",
  "ai model set <provider> <model>",
  "",
  "Task extraction:",
  "Paste meeting notes directly after the slash command.",
].join("\n");

function tokenize(input: string): string[] {
  const tokens: string[] = [];
  const pattern = /"([^"]*)"|'([^']*)'|(\S+)/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(input)) !== null) {
    tokens.push(match[1] ?? match[2] ?? match[3]);
  }
  return tokens;
}

function isConfigAdmin(userId: string): boolean {
  const configured = (process.env.AI_CONFIG_ADMIN_USER_IDS ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  return configured.length === 0 || configured.includes(userId);
}

function configGuard(context: CommandContext): CommandResult | null {
  if (!context.isDirectMessage) {
    return {
      handled: true,
      sensitive: true,
      text: [
        "AI configuration is allowed only in a direct message to the bot.",
        "Do not paste API keys into a team channel.",
      ].join("\n"),
    };
  }

  if (!isConfigAdmin(context.userId)) {
    return {
      handled: true,
      text: "You are not allowed to change this account's AI configuration.",
    };
  }

  return null;
}

function completeProviderOrder(values: AiProvider[]): AiProvider[] {
  return [
    ...values,
    ...DEFAULT_PROVIDER_ORDER.filter((provider) => !values.includes(provider)),
  ];
}

function formatProviderOrder(order: AiProvider[]): string {
  return order
    .map((provider, index) => `${index + 1}. ${provider}`)
    .join("\n");
}

export async function handleChatCommand(
  input: string,
  context: CommandContext,
  store: AppStore,
): Promise<CommandResult> {
  const tokens = tokenize(input.trim());
  const lowered = tokens.map((token) => token.toLowerCase());

  if (tokens.length === 0 || ["help", "도움말", "ヘルプ"].includes(lowered[0])) {
    return { handled: true, text: HELP_TEXT };
  }

  if (lowered[0] !== "ai") {
    return { handled: false };
  }

  const guard = configGuard(context);
  if (guard) return guard;

  if (lowered[1] === "status" || lowered[1] === "key" && lowered[2] === "list") {
    const [settings, keys] = await Promise.all([
      store.getAiSettings(context.accountId),
      store.listProviderKeys(context.accountId),
    ]);
    const keyLines =
      keys.length === 0
        ? ["No chat-registered keys."]
        : keys.map(
            (key) =>
              `${key.id} | ${key.provider} | ${key.label} | ${key.keyHint} | ` +
              `priority=${key.priority} | ${key.enabled ? "enabled" : "disabled"}` +
              `${key.failureCount ? ` | failures=${key.failureCount}` : ""}`,
          );
    const modelLines = AI_PROVIDERS.map(
      (provider) => `${provider}: ${settings.models[provider]}`,
    );

    return {
      handled: true,
      text: [
        "Provider fallback order",
        formatProviderOrder(settings.providerOrder),
        "",
        "Models",
        ...modelLines,
        "",
        "Registered keys",
        ...keyLines,
        "",
        "Environment keys are not shown here.",
      ].join("\n"),
    };
  }

  if (lowered[1] === "key" && lowered[2] === "add") {
    const provider = lowered[3];
    const apiKey = tokens[4];
    const label = tokens.slice(5).join(" ") || `${provider || "ai"} key`;

    if (!provider || !isAiProvider(provider) || !apiKey) {
      return {
        handled: true,
        text: "Usage: ai key add <openai|gemini|claude> <api-key> [label]",
      };
    }

    if (apiKey.length < 16) {
      return {
        handled: true,
        text: "The API key is too short. No key was stored.",
      };
    }

    const id = createProviderKeyId();
    const existing = await store.listProviderKeys(context.accountId);
    const providerPriorities = existing
      .filter((key) => key.provider === provider)
      .map((key) => key.priority);
    const priority =
      providerPriorities.length > 0 ? Math.max(...providerPriorities) + 10 : 100;
    const encryptionContext = `${context.accountId}:${id}`;

    await store.addProviderKey({
      id,
      accountId: context.accountId,
      provider,
      label: label.slice(0, 80),
      encryptedKey: encryptSecret(apiKey, encryptionContext),
      keyHint: maskSecret(apiKey),
      priority,
      registeredBy: context.userId,
    });

    return {
      handled: true,
      sensitive: true,
      text: [
        `Stored ${provider} key as ${id} (${maskSecret(apiKey)}).`,
        `Key priority: ${priority}`,
        "The original key is encrypted and will not be displayed again.",
        "For production, environment or secret-manager registration is safer than chat history.",
      ].join("\n"),
    };
  }

  if (
    lowered[1] === "key" &&
    ["remove", "enable", "disable"].includes(lowered[2])
  ) {
    const operation = lowered[2];
    const idPrefix = tokens[3];
    if (!idPrefix) {
      return {
        handled: true,
        text: `Usage: ai key ${operation} <key-id-or-prefix>`,
      };
    }

    const changed =
      operation === "remove"
        ? await store.removeProviderKey(context.accountId, idPrefix)
        : await store.setProviderKeyEnabled(
            context.accountId,
            idPrefix,
            operation === "enable",
          );

    return {
      handled: true,
      text: changed
        ? `Key ${operation} completed.`
        : "No unique key matched that ID or prefix.",
    };
  }

  if (lowered[1] === "key" && lowered[2] === "priority") {
    const idPrefix = tokens[3];
    const priority = Number(tokens[4]);
    if (!idPrefix || !Number.isInteger(priority) || priority < 0) {
      return {
        handled: true,
        text: "Usage: ai key priority <key-id-or-prefix> <non-negative-number>",
      };
    }

    const changed = await store.setProviderKeyPriority(
      context.accountId,
      idPrefix,
      priority,
    );
    return {
      handled: true,
      text: changed
        ? `Key priority changed to ${priority}.`
        : "No unique key matched that ID or prefix.",
    };
  }

  if (lowered[1] === "priority" && lowered[2] === "set") {
    const requested = lowered.slice(3);
    const invalid = requested.find((provider) => !isAiProvider(provider));
    const unique = [...new Set(requested)] as AiProvider[];

    if (invalid || unique.length === 0) {
      return {
        handled: true,
        text: "Usage: ai priority set openai gemini claude",
      };
    }

    const order = completeProviderOrder(unique);
    await store.setProviderOrder(context.accountId, order);
    return {
      handled: true,
      text: `Provider fallback order updated:\n${formatProviderOrder(order)}`,
    };
  }

  if (lowered[1] === "model" && lowered[2] === "set") {
    const provider = lowered[3];
    const model = tokens[4];
    if (!provider || !isAiProvider(provider) || !model) {
      return {
        handled: true,
        text: "Usage: ai model set <openai|gemini|claude> <model>",
      };
    }

    await store.setProviderModel(context.accountId, provider, model);
    return {
      handled: true,
      text: `${provider} model updated to ${model}.`,
    };
  }

  return {
    handled: true,
    text: `Unknown AI command.\n\n${HELP_TEXT}`,
  };
}
