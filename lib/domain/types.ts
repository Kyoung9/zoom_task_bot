export const AI_PROVIDERS = ["openai", "gemini", "claude"] as const;

export type AiProvider = (typeof AI_PROVIDERS)[number];

export const DEFAULT_PROVIDER_ORDER: AiProvider[] = [
  "openai",
  "gemini",
  "claude",
];

export const DEFAULT_MODELS: Record<AiProvider, string> = {
  openai: process.env.OPENAI_MODEL || "gpt-5-mini",
  gemini: process.env.GEMINI_MODEL || "gemini-3.5-flash",
  claude: process.env.ANTHROPIC_MODEL || "claude-sonnet-4-6",
};

export type TaskPriority = "Low" | "Medium" | "High" | "Highest";
export type TaskStatus =
  | "To do"
  | "In progress"
  | "Blocked"
  | "Recommended";

export type ExtractedTask = {
  tempId: string;
  title: string;
  description: string;
  assigneeName: string | null;
  assigneeEmail: string | null;
  dueDate: string | null;
  priority: TaskPriority;
  status: TaskStatus;
  evidence: string;
  confidence: number;
  shouldCreateTask: boolean;
  createdZoomTaskId?: string;
};

export type ExcludedItem = {
  text: string;
  reason: string;
};

export type TaskExtraction = {
  tasks: ExtractedTask[];
  excludedItems: ExcludedItem[];
};

export type AiSettings = {
  providerOrder: AiProvider[];
  models: Record<AiProvider, string>;
};

export type ProviderKeyRecord = {
  id: string;
  accountId: string;
  provider: AiProvider;
  label: string;
  encryptedKey: string;
  keyHint: string;
  priority: number;
  enabled: boolean;
  registeredBy: string;
  failureCount: number;
  lastError: string | null;
  lastUsedAt: Date | null;
  createdAt: Date;
};

export type ApprovalStatus =
  | "pending"
  | "processing"
  | "approved"
  | "cancelled"
  | "failed";

export type ApprovalSession = {
  id: string;
  accountId: string;
  channelId: string;
  toJid: string;
  robotJid: string;
  userJid: string;
  requestedBy: string;
  status: ApprovalStatus;
  tasks: ExtractedTask[];
  excludedItems: ExcludedItem[];
  createdAt: Date;
  expiresAt: Date;
};

export function isAiProvider(value: string): value is AiProvider {
  return AI_PROVIDERS.includes(value as AiProvider);
}
