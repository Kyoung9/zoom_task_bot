import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { createPostgresClient } from "../lib/db/postgres";

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required.");
  }

  const migrationsDir = path.join(process.cwd(), "db/migrations");
  const files = (await readdir(migrationsDir))
    .filter((file) => file.endsWith(".sql"))
    .sort();

  if (files.length === 0) {
    throw new Error("No migration files found.");
  }

  const sql = createPostgresClient(databaseUrl, { max: 1 });

  try {
    for (const file of files) {
      const migration = await readFile(path.join(migrationsDir, file), "utf8");
      await sql.unsafe(migration);
      console.log(`Applied migration: ${file}`);
    }
    console.log("Database migration completed.");
  } finally {
    await sql.end();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Migration failed.");
  process.exit(1);
});
