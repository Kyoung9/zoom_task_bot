import type { ExtractedTask } from "@/lib/domain/types";

type TokenCache = {
  token: string;
  expiresAt: number;
};

let chatbotTokenCache: TokenCache | null = null;
let tasksTokenCache: TokenCache | null = null;

function basicAuth(clientId: string, clientSecret: string): string {
  return Buffer.from(`${clientId}:${clientSecret}`, "utf8").toString("base64");
}

async function parseZoomError(response: Response): Promise<string> {
  const text = await response.text();
  try {
    const body = JSON.parse(text) as { message?: string; code?: number };
    return `${body.code ? `[${body.code}] ` : ""}${body.message || text}`;
  } catch {
    return text.slice(0, 300);
  }
}

async function getChatbotToken(): Promise<string> {
  if (chatbotTokenCache && chatbotTokenCache.expiresAt > Date.now() + 30_000) {
    return chatbotTokenCache.token;
  }

  const clientId = process.env.ZOOM_CLIENT_ID;
  const clientSecret = process.env.ZOOM_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("ZOOM_CLIENT_ID and ZOOM_CLIENT_SECRET are required.");
  }

  const response = await fetch(
    "https://zoom.us/oauth/token?grant_type=client_credentials",
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${basicAuth(clientId, clientSecret)}`,
      },
    },
  );
  if (!response.ok) {
    throw new Error(`Zoom chatbot auth failed: ${await parseZoomError(response)}`);
  }
  const body = (await response.json()) as {
    access_token: string;
    expires_in: number;
  };
  chatbotTokenCache = {
    token: body.access_token,
    expiresAt: Date.now() + body.expires_in * 1000,
  };
  return body.access_token;
}

async function getTasksToken(): Promise<string> {
  const fixedToken = process.env.ZOOM_TASKS_ACCESS_TOKEN;
  if (fixedToken) return fixedToken;

  if (tasksTokenCache && tasksTokenCache.expiresAt > Date.now() + 30_000) {
    return tasksTokenCache.token;
  }

  const accountId = process.env.ZOOM_TASKS_ACCOUNT_ID;
  const clientId = process.env.ZOOM_TASKS_CLIENT_ID;
  const clientSecret = process.env.ZOOM_TASKS_CLIENT_SECRET;
  if (!accountId || !clientId || !clientSecret) {
    throw new Error(
      "Zoom Tasks OAuth is not configured. Set ZOOM_TASKS_ACCOUNT_ID, " +
        "ZOOM_TASKS_CLIENT_ID, and ZOOM_TASKS_CLIENT_SECRET.",
    );
  }

  const url = new URL("https://zoom.us/oauth/token");
  url.searchParams.set("grant_type", "account_credentials");
  url.searchParams.set("account_id", accountId);
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basicAuth(clientId, clientSecret)}`,
    },
  });
  if (!response.ok) {
    throw new Error(`Zoom Tasks auth failed: ${await parseZoomError(response)}`);
  }
  const body = (await response.json()) as {
    access_token: string;
    expires_in: number;
  };
  tasksTokenCache = {
    token: body.access_token,
    expiresAt: Date.now() + body.expires_in * 1000,
  };
  return body.access_token;
}

export type ZoomMessageContext = {
  accountId: string;
  toJid: string;
  robotJid: string;
  userJid?: string;
  replyTo?: string;
  visibleToUser?: string;
};

export type ZoomMessageContent = {
  head?: { text: string; sub_head?: { text: string } };
  body?: Array<Record<string, unknown>>;
};

export async function sendZoomMessage(
  context: ZoomMessageContext,
  content: ZoomMessageContent,
): Promise<void> {
  const token = await getChatbotToken();
  const response = await fetch("https://api.zoom.us/v2/im/chat/messages", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      robot_jid: context.robotJid,
      to_jid: context.toJid,
      account_id: context.accountId,
      user_jid: context.userJid,
      reply_to: context.replyTo,
      visible_to_user: context.visibleToUser,
      is_markdown_support: true,
      content,
    }),
  });
  if (!response.ok) {
    throw new Error(`Zoom message failed: ${await parseZoomError(response)}`);
  }
}

function taskDescription(task: ExtractedTask): string {
  return [
    task.description,
    task.assigneeName && !task.assigneeEmail
      ? `Assignee from meeting notes: ${task.assigneeName}`
      : "",
    "",
    `Evidence: ${task.evidence}`,
    `AI confidence: ${task.confidence.toFixed(2)}`,
  ]
    .filter(Boolean)
    .join("\n");
}

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function createTaskRequest(
  token: string,
  task: ExtractedTask,
  includeAssignee: boolean,
): Promise<Response> {
  return fetch("https://api.zoom.us/v2/tasks/items", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      title: task.title,
      description: taskDescription(task),
      priority: task.priority,
      status: "To do",
      due_date: task.dueDate ?? undefined,
      is_public: false,
      starred: false,
      assignees:
        includeAssignee && task.assigneeEmail
          ? [{ email: task.assigneeEmail }]
          : undefined,
      skip_notifications: false,
    }),
  });
}

export type ZoomTaskCreationResult =
  | {
      success: true;
      taskId: string;
      title: string;
      link?: string;
      assigneeOmitted: boolean;
    }
  | { success: false; title: string; error: string };

export async function createZoomTask(
  task: ExtractedTask,
): Promise<ZoomTaskCreationResult> {
  const token = await getTasksToken();
  let includeAssignee = Boolean(task.assigneeEmail);

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const response = await createTaskRequest(token, task, includeAssignee);
    if (response.ok) {
      const body = (await response.json()) as {
        task_id: string;
        title: string;
        link?: string;
      };
      return {
        success: true,
        taskId: body.task_id,
        title: body.title,
        link: body.link,
        assigneeOmitted: Boolean(task.assigneeEmail) && !includeAssignee,
      };
    }

    const error = await parseZoomError(response);
    if (
      includeAssignee &&
      task.assigneeEmail &&
      [400, 404].includes(response.status)
    ) {
      includeAssignee = false;
      continue;
    }

    if (response.status === 429 || response.status >= 500) {
      const retryAfter = Number(response.headers.get("retry-after") || 0);
      await sleep(retryAfter > 0 ? retryAfter * 1000 : 500 * 2 ** attempt);
      continue;
    }

    return { success: false, title: task.title, error };
  }

  return {
    success: false,
    title: task.title,
    error: "Zoom Tasks API retry limit exceeded.",
  };
}
