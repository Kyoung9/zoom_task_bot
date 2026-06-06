import postgres from "postgres";

export function createPostgresClient(
  databaseUrl: string,
  options: { max?: number } = {},
): postgres.Sql {
  const usePooler = databaseUrl.includes("pgbouncer=true");
  const useSsl = !databaseUrl.includes("localhost");

  return postgres(databaseUrl, {
    ssl: useSsl ? "require" : false,
    max: options.max ?? 5,
    idle_timeout: 20,
    prepare: usePooler ? false : undefined,
  });
}
