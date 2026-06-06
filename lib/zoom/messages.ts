import type {
  ExcludedItem,
  ExtractedTask,
} from "@/lib/domain/types";
import type { ZoomMessageContent } from "@/lib/zoom/client";

export function textMessage(
  text: string,
  title = "Meeting Task Bot",
): ZoomMessageContent {
  return {
    head: { text: title },
    body: [{ type: "message", text }],
  };
}

function formatTask(task: ExtractedTask, index: number): string {
  return [
    `**${index + 1}. ${task.title}**`,
    `担当: ${task.assigneeName || "未定"}`,
    `期限: ${task.dueDate || "未定"}`,
    `優先度: ${task.priority}`,
    `信頼度: ${Math.round(task.confidence * 100)}%`,
    `根拠: ${task.evidence}`,
  ].join("\n");
}

export function taskReviewMessage(input: {
  approvalId: string;
  tasks: ExtractedTask[];
  excludedItems: ExcludedItem[];
  provider: string;
  model: string;
}): ZoomMessageContent {
  const creatable = input.tasks.filter((task) => task.shouldCreateTask);
  const visibleTasks = creatable.slice(0, 10);
  const taskText = visibleTasks.map(formatTask).join("\n\n");
  const hiddenTaskText =
    creatable.length > visibleTasks.length
      ? `\n\n他 ${creatable.length - visibleTasks.length}件も承認時に登録されます。`
      : "";
  const excludedText =
    input.excludedItems.length > 0
      ? `\n\n除外:\n${input.excludedItems
          .slice(0, 3)
          .map((item) => `- ${item.text}: ${item.reason}`)
          .join("\n")}`
      : "";

  return {
    head: {
      text: "抽出されたタスク",
      sub_head: { text: `${input.provider} / ${input.model}` },
    },
    body: [
      {
        type: "message",
        text: `${taskText}${hiddenTaskText}${excludedText}`,
      },
      {
        type: "actions",
        items: [
          {
            text: "全部登録",
            value: `approve:${input.approvalId}`,
            style: "Primary",
          },
          {
            text: "キャンセル",
            value: `cancel:${input.approvalId}`,
            style: "Danger",
          },
        ],
      },
    ],
  };
}

export function approvalResultMessage(input: {
  succeeded: Array<{ title: string; assigneeOmitted: boolean }>;
  failed: Array<{ title: string; error: string }>;
}): ZoomMessageContent {
  const lines = [
    `成功: ${input.succeeded.length}件`,
    `失敗: ${input.failed.length}件`,
  ];

  if (input.succeeded.length > 0) {
    lines.push(
      "",
      ...input.succeeded.map(
        (task) =>
          `- ${task.title}${task.assigneeOmitted ? " (担当者なしで登録)" : ""}`,
      ),
    );
  }
  if (input.failed.length > 0) {
    lines.push(
      "",
      "失敗理由:",
      ...input.failed.map((task) => `- ${task.title}: ${task.error}`),
    );
  }

  return textMessage(
    lines.join("\n"),
    input.failed.length > 0 ? "一部の登録に失敗しました" : "登録完了",
  );
}
