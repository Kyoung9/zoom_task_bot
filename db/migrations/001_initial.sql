create table if not exists ai_provider_keys (
  id text primary key,
  account_id text not null,
  provider text not null check (provider in ('openai', 'gemini', 'claude')),
  label text not null,
  encrypted_key text not null,
  key_hint text not null,
  priority integer not null default 100,
  enabled boolean not null default true,
  registered_by text not null,
  failure_count integer not null default 0,
  last_error text,
  last_used_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists ai_provider_keys_account_provider_idx
  on ai_provider_keys (account_id, provider, enabled, priority, created_at);

create table if not exists ai_settings (
  account_id text primary key,
  provider_order jsonb not null,
  models jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists approval_sessions (
  id text primary key,
  account_id text not null,
  channel_id text not null,
  to_jid text not null,
  robot_jid text not null,
  user_jid text not null,
  requested_by text not null,
  status text not null check (
    status in ('pending', 'processing', 'approved', 'cancelled', 'failed')
  ),
  tasks jsonb not null,
  excluded_items jsonb not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);

create index if not exists approval_sessions_status_expiry_idx
  on approval_sessions (status, expires_at);

create table if not exists user_alias_maps (
  id text primary key,
  account_id text not null,
  alias text not null,
  email text not null,
  zoom_user_id text,
  created_at timestamptz not null default now(),
  unique (account_id, alias)
);
