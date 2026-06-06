import { NextResponse } from "next/server";
import { createPostgresClient } from "@/lib/db/postgres";

export const runtime = "nodejs";

async function checkDatabase(): Promise<"ok" | "error" | "skipped"> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) return "skipped";

  const sql = createPostgresClient(databaseUrl, { max: 1 });
  try {
    await sql`select 1`;
    return "ok";
  } catch {
    return "error";
  } finally {
    await sql.end();
  }
}

export async function GET() {
  const persistence = process.env.DATABASE_URL ? "postgres" : "memory";
  const database = await checkDatabase();

  return NextResponse.json({
    ok: persistence === "memory" || database === "ok",
    service: "zoom-meeting-task-bot",
    persistence,
    database,
    aiEnvironmentKeys: {
      openai: Boolean(process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEYS),
      gemini: Boolean(process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEYS),
      claude: Boolean(
        process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEYS,
      ),
    },
    zoomChatConfigured: Boolean(
      process.env.ZOOM_CLIENT_ID &&
        process.env.ZOOM_CLIENT_SECRET &&
        process.env.ZOOM_BOT_JID,
    ),
    zoomTasksConfigured: Boolean(
      process.env.ZOOM_TASKS_ACCESS_TOKEN ||
        (process.env.ZOOM_TASKS_ACCOUNT_ID &&
          process.env.ZOOM_TASKS_CLIENT_ID &&
          process.env.ZOOM_TASKS_CLIENT_SECRET),
    ),
  });
}
