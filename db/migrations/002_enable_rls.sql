-- サーバー専用テーブル: anon/authenticated からの直接アクセスを拒否
alter table ai_provider_keys enable row level security;
alter table ai_settings enable row level security;
alter table approval_sessions enable row level security;
alter table user_alias_maps enable row level security;
-- ポリシーなし = Data API 経由のアクセス拒否
-- サーバーは postgres ロール接続で RLS をバイパス
