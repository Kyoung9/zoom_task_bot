import { randomUUID } from "node:crypto";
import type postgres from "postgres";
import { createPostgresClient } from "@/lib/db/postgres";
import {
  DEFAULT_MODELS,
  DEFAULT_PROVIDER_ORDER,
  type AiProvider,
  type AiSettings,
  type ApprovalSession,
  type ApprovalStatus,
  type ExcludedItem,
  type ExtractedTask,
  type ProviderKeyRecord,
} from "@/lib/domain/types";

export type AddProviderKeyInput = Omit<
  ProviderKeyRecord,
  | "failureCount"
  | "lastError"
  | "lastUsedAt"
  | "createdAt"
  | "enabled"
>;

export type CreateApprovalInput = Omit<
  ApprovalSession,
  "status" | "createdAt"
>;

export interface AppStore {
  listProviderKeys(accountId: string): Promise<ProviderKeyRecord[]>;
  addProviderKey(input: AddProviderKeyInput): Promise<ProviderKeyRecord>;
  removeProviderKey(accountId: string, idPrefix: string): Promise<boolean>;
  setProviderKeyEnabled(
    accountId: string,
    idPrefix: string,
    enabled: boolean,
  ): Promise<boolean>;
  setProviderKeyPriority(
    accountId: string,
    idPrefix: string,
    priority: number,
  ): Promise<boolean>;
  recordProviderKeyResult(
    id: string,
    result: { success: boolean; error?: string },
  ): Promise<void>;
  getAiSettings(accountId: string): Promise<AiSettings>;
  setProviderOrder(
    accountId: string,
    providerOrder: AiProvider[],
  ): Promise<AiSettings>;
  setProviderModel(
    accountId: string,
    provider: AiProvider,
    model: string,
  ): Promise<AiSettings>;
  createApproval(input: CreateApprovalInput): Promise<ApprovalSession>;
  getApproval(id: string): Promise<ApprovalSession | null>;
  claimApproval(
    id: string,
    from: ApprovalStatus,
    to: ApprovalStatus,
  ): Promise<ApprovalSession | null>;
  completeApproval(
    id: string,
    status: ApprovalStatus,
    tasks: ExtractedTask[],
  ): Promise<void>;
  getAliasMap(accountId: string): Promise<Record<string, string>>;
}

function defaultSettings(): AiSettings {
  return {
    providerOrder: [...DEFAULT_PROVIDER_ORDER],
    models: { ...DEFAULT_MODELS },
  };
}

function matchesPrefix(id: string, prefix: string): boolean {
  return id === prefix || id.startsWith(prefix);
}

export class MemoryStore implements AppStore {
  private readonly providerKeys = new Map<string, ProviderKeyRecord>();
  private readonly settings = new Map<string, AiSettings>();
  private readonly approvals = new Map<string, ApprovalSession>();
  private readonly aliases = new Map<string, Record<string, string>>();

  async listProviderKeys(accountId: string): Promise<ProviderKeyRecord[]> {
    return [...this.providerKeys.values()]
      .filter((key) => key.accountId === accountId)
      .sort(
        (left, right) =>
          left.priority - right.priority ||
          left.createdAt.getTime() - right.createdAt.getTime(),
      );
  }

  async addProviderKey(
    input: AddProviderKeyInput,
  ): Promise<ProviderKeyRecord> {
    const record: ProviderKeyRecord = {
      ...input,
      enabled: true,
      failureCount: 0,
      lastError: null,
      lastUsedAt: null,
      createdAt: new Date(),
    };
    this.providerKeys.set(record.id, record);
    return record;
  }

  async removeProviderKey(
    accountId: string,
    idPrefix: string,
  ): Promise<boolean> {
    const record = this.findUniqueKey(accountId, idPrefix);
    return record ? this.providerKeys.delete(record.id) : false;
  }

  async setProviderKeyEnabled(
    accountId: string,
    idPrefix: string,
    enabled: boolean,
  ): Promise<boolean> {
    const record = this.findUniqueKey(accountId, idPrefix);
    if (!record) return false;
    record.enabled = enabled;
    return true;
  }

  async setProviderKeyPriority(
    accountId: string,
    idPrefix: string,
    priority: number,
  ): Promise<boolean> {
    const record = this.findUniqueKey(accountId, idPrefix);
    if (!record) return false;
    record.priority = priority;
    return true;
  }

  async recordProviderKeyResult(
    id: string,
    result: { success: boolean; error?: string },
  ): Promise<void> {
    const record = this.providerKeys.get(id);
    if (!record) return;
    record.lastUsedAt = new Date();
    if (result.success) {
      record.failureCount = 0;
      record.lastError = null;
    } else {
      record.failureCount += 1;
      record.lastError = result.error?.slice(0, 300) ?? "Unknown provider error";
    }
  }

  async getAiSettings(accountId: string): Promise<AiSettings> {
    const settings = this.settings.get(accountId) ?? defaultSettings();
    return {
      providerOrder: [...settings.providerOrder],
      models: { ...settings.models },
    };
  }

  async setProviderOrder(
    accountId: string,
    providerOrder: AiProvider[],
  ): Promise<AiSettings> {
    const settings = await this.getAiSettings(accountId);
    settings.providerOrder = [...providerOrder];
    this.settings.set(accountId, settings);
    return settings;
  }

  async setProviderModel(
    accountId: string,
    provider: AiProvider,
    model: string,
  ): Promise<AiSettings> {
    const settings = await this.getAiSettings(accountId);
    settings.models[provider] = model;
    this.settings.set(accountId, settings);
    return settings;
  }

  async createApproval(
    input: CreateApprovalInput,
  ): Promise<ApprovalSession> {
    const approval: ApprovalSession = {
      ...input,
      status: "pending",
      createdAt: new Date(),
    };
    this.approvals.set(approval.id, approval);
    return approval;
  }

  async getApproval(id: string): Promise<ApprovalSession | null> {
    return this.approvals.get(id) ?? null;
  }

  async claimApproval(
    id: string,
    from: ApprovalStatus,
    to: ApprovalStatus,
  ): Promise<ApprovalSession | null> {
    const approval = this.approvals.get(id);
    if (
      !approval ||
      approval.status !== from ||
      approval.expiresAt.getTime() <= Date.now()
    ) {
      return null;
    }
    approval.status = to;
    return approval;
  }

  async completeApproval(
    id: string,
    status: ApprovalStatus,
    tasks: ExtractedTask[],
  ): Promise<void> {
    const approval = this.approvals.get(id);
    if (!approval) return;
    approval.status = status;
    approval.tasks = tasks;
  }

  async getAliasMap(accountId: string): Promise<Record<string, string>> {
    return { ...(this.aliases.get(accountId) ?? {}) };
  }

  private findUniqueKey(
    accountId: string,
    idPrefix: string,
  ): ProviderKeyRecord | null {
    const matches = [...this.providerKeys.values()].filter(
      (key) =>
        key.accountId === accountId && matchesPrefix(key.id, idPrefix),
    );
    return matches.length === 1 ? matches[0] : null;
  }
}

type ProviderKeyRow = {
  id: string;
  account_id: string;
  provider: AiProvider;
  label: string;
  encrypted_key: string;
  key_hint: string;
  priority: number;
  enabled: boolean;
  registered_by: string;
  failure_count: number;
  last_error: string | null;
  last_used_at: Date | null;
  created_at: Date;
};

type ApprovalRow = {
  id: string;
  account_id: string;
  channel_id: string;
  to_jid: string;
  robot_jid: string;
  user_jid: string;
  requested_by: string;
  status: ApprovalStatus;
  tasks: ExtractedTask[];
  excluded_items: ExcludedItem[];
  created_at: Date;
  expires_at: Date;
};

function mapProviderKey(row: ProviderKeyRow): ProviderKeyRecord {
  return {
    id: row.id,
    accountId: row.account_id,
    provider: row.provider,
    label: row.label,
    encryptedKey: row.encrypted_key,
    keyHint: row.key_hint,
    priority: row.priority,
    enabled: row.enabled,
    registeredBy: row.registered_by,
    failureCount: row.failure_count,
    lastError: row.last_error,
    lastUsedAt: row.last_used_at,
    createdAt: row.created_at,
  };
}

function mapApproval(row: ApprovalRow): ApprovalSession {
  return {
    id: row.id,
    accountId: row.account_id,
    channelId: row.channel_id,
    toJid: row.to_jid,
    robotJid: row.robot_jid,
    userJid: row.user_jid,
    requestedBy: row.requested_by,
    status: row.status,
    tasks: row.tasks,
    excludedItems: row.excluded_items,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
  };
}

export class PostgresStore implements AppStore {
  constructor(private readonly sql: postgres.Sql) {}

  async listProviderKeys(accountId: string): Promise<ProviderKeyRecord[]> {
    const rows = await this.sql<ProviderKeyRow[]>`
      select *
      from ai_provider_keys
      where account_id = ${accountId}
      order by priority asc, created_at asc
    `;
    return rows.map(mapProviderKey);
  }

  async addProviderKey(
    input: AddProviderKeyInput,
  ): Promise<ProviderKeyRecord> {
    const rows = await this.sql<ProviderKeyRow[]>`
      insert into ai_provider_keys (
        id, account_id, provider, label, encrypted_key, key_hint,
        priority, registered_by
      )
      values (
        ${input.id}, ${input.accountId}, ${input.provider}, ${input.label},
        ${input.encryptedKey}, ${input.keyHint}, ${input.priority},
        ${input.registeredBy}
      )
      returning *
    `;
    return mapProviderKey(rows[0]);
  }

  async removeProviderKey(
    accountId: string,
    idPrefix: string,
  ): Promise<boolean> {
    const id = await this.resolveUniqueKeyId(accountId, idPrefix);
    if (!id) return false;
    const result = await this.sql`
      delete from ai_provider_keys
      where account_id = ${accountId} and id = ${id}
    `;
    return result.count === 1;
  }

  async setProviderKeyEnabled(
    accountId: string,
    idPrefix: string,
    enabled: boolean,
  ): Promise<boolean> {
    const id = await this.resolveUniqueKeyId(accountId, idPrefix);
    if (!id) return false;
    const result = await this.sql`
      update ai_provider_keys
      set enabled = ${enabled}
      where account_id = ${accountId} and id = ${id}
    `;
    return result.count === 1;
  }

  async setProviderKeyPriority(
    accountId: string,
    idPrefix: string,
    priority: number,
  ): Promise<boolean> {
    const id = await this.resolveUniqueKeyId(accountId, idPrefix);
    if (!id) return false;
    const result = await this.sql`
      update ai_provider_keys
      set priority = ${priority}
      where account_id = ${accountId} and id = ${id}
    `;
    return result.count === 1;
  }

  async recordProviderKeyResult(
    id: string,
    result: { success: boolean; error?: string },
  ): Promise<void> {
    if (result.success) {
      await this.sql`
        update ai_provider_keys
        set failure_count = 0, last_error = null, last_used_at = now()
        where id = ${id}
      `;
      return;
    }

    await this.sql`
      update ai_provider_keys
      set
        failure_count = failure_count + 1,
        last_error = ${(result.error ?? "Unknown provider error").slice(0, 300)},
        last_used_at = now()
      where id = ${id}
    `;
  }

  async getAiSettings(accountId: string): Promise<AiSettings> {
    const rows = await this.sql<
      { provider_order: AiProvider[]; models: Record<AiProvider, string> }[]
    >`
      select provider_order, models
      from ai_settings
      where account_id = ${accountId}
    `;
    if (!rows[0]) return defaultSettings();

    return {
      providerOrder: rows[0].provider_order,
      models: { ...DEFAULT_MODELS, ...rows[0].models },
    };
  }

  async setProviderOrder(
    accountId: string,
    providerOrder: AiProvider[],
  ): Promise<AiSettings> {
    const settings = await this.getAiSettings(accountId);
    await this.saveSettings(accountId, {
      ...settings,
      providerOrder,
    });
    return { ...settings, providerOrder };
  }

  async setProviderModel(
    accountId: string,
    provider: AiProvider,
    model: string,
  ): Promise<AiSettings> {
    const settings = await this.getAiSettings(accountId);
    settings.models[provider] = model;
    await this.saveSettings(accountId, settings);
    return settings;
  }

  async createApproval(
    input: CreateApprovalInput,
  ): Promise<ApprovalSession> {
    const rows = await this.sql<ApprovalRow[]>`
      insert into approval_sessions (
        id, account_id, channel_id, to_jid, robot_jid, user_jid,
        requested_by, status, tasks, excluded_items, expires_at
      )
      values (
        ${input.id}, ${input.accountId}, ${input.channelId}, ${input.toJid},
        ${input.robotJid}, ${input.userJid}, ${input.requestedBy}, 'pending',
        ${this.sql.json(input.tasks)}, ${this.sql.json(input.excludedItems)},
        ${input.expiresAt}
      )
      returning *
    `;
    return mapApproval(rows[0]);
  }

  async getApproval(id: string): Promise<ApprovalSession | null> {
    const rows = await this.sql<ApprovalRow[]>`
      select *
      from approval_sessions
      where id = ${id}
    `;
    return rows[0] ? mapApproval(rows[0]) : null;
  }

  async claimApproval(
    id: string,
    from: ApprovalStatus,
    to: ApprovalStatus,
  ): Promise<ApprovalSession | null> {
    const rows = await this.sql<ApprovalRow[]>`
      update approval_sessions
      set status = ${to}
      where id = ${id} and status = ${from} and expires_at > now()
      returning *
    `;
    return rows[0] ? mapApproval(rows[0]) : null;
  }

  async completeApproval(
    id: string,
    status: ApprovalStatus,
    tasks: ExtractedTask[],
  ): Promise<void> {
    await this.sql`
      update approval_sessions
      set status = ${status}, tasks = ${this.sql.json(tasks)}
      where id = ${id}
    `;
  }

  async getAliasMap(accountId: string): Promise<Record<string, string>> {
    const rows = await this.sql<{ alias: string; email: string }[]>`
      select alias, email
      from user_alias_maps
      where account_id = ${accountId}
    `;
    return Object.fromEntries(rows.map((row) => [row.alias, row.email]));
  }

  private async saveSettings(
    accountId: string,
    settings: AiSettings,
  ): Promise<void> {
    await this.sql`
      insert into ai_settings (account_id, provider_order, models)
      values (
        ${accountId},
        ${this.sql.json(settings.providerOrder)},
        ${this.sql.json(settings.models)}
      )
      on conflict (account_id)
      do update set
        provider_order = excluded.provider_order,
        models = excluded.models,
        updated_at = now()
    `;
  }

  private async resolveUniqueKeyId(
    accountId: string,
    prefix: string,
  ): Promise<string | null> {
    const rows = await this.sql<{ id: string }[]>`
      select id
      from ai_provider_keys
      where account_id = ${accountId} and id like ${`${prefix}%`}
      limit 2
    `;
    return rows.length === 1 ? rows[0].id : null;
  }
}

let store: AppStore | undefined;

export function getStore(): AppStore {
  if (store) return store;

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    store = new MemoryStore();
    return store;
  }

  const sql = createPostgresClient(databaseUrl);
  store = new PostgresStore(sql);
  return store;
}

export function createProviderKeyId(): string {
  return `key_${randomUUID().replaceAll("-", "").slice(0, 16)}`;
}

export function createApprovalId(): string {
  return `approval_${randomUUID().replaceAll("-", "").slice(0, 20)}`;
}
