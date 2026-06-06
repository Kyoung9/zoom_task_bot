import type { ExtractedTask } from "@/lib/domain/types";
import type { AppStore } from "@/lib/storage/store";
import {
  createZoomTask,
  type ZoomTaskCreationResult,
} from "@/lib/zoom/client";

export type ApprovalActionResult =
  | { kind: "cancelled" }
  | { kind: "forbidden" }
  | { kind: "unavailable" }
  | {
      kind: "approved";
      succeeded: Array<{
        title: string;
        taskId: string;
        assigneeOmitted: boolean;
      }>;
      failed: Array<{ title: string; error: string }>;
    };

export async function processApprovalAction(input: {
  approvalId: string;
  action: "approve" | "cancel";
  userId: string;
  store: AppStore;
  taskCreator?: (
    task: ExtractedTask,
  ) => Promise<ZoomTaskCreationResult>;
}): Promise<ApprovalActionResult> {
  const existing = await input.store.getApproval(input.approvalId);
  if (!existing || existing.expiresAt.getTime() <= Date.now()) {
    return { kind: "unavailable" };
  }
  if (existing.requestedBy !== input.userId) {
    return { kind: "forbidden" };
  }

  if (input.action === "cancel") {
    const claimed = await input.store.claimApproval(
      input.approvalId,
      "pending",
      "cancelled",
    );
    return claimed ? { kind: "cancelled" } : { kind: "unavailable" };
  }

  const approval = await input.store.claimApproval(
    input.approvalId,
    "pending",
    "processing",
  );
  if (!approval) return { kind: "unavailable" };

  const creator = input.taskCreator ?? createZoomTask;
  const tasks = approval.tasks.filter((task) => task.shouldCreateTask);
  const results: ZoomTaskCreationResult[] = [];
  const updatedTasks = [...approval.tasks];

  for (const task of tasks) {
    const result = await creator(task);
    results.push(result);
    if (result.success) {
      const storedTask = updatedTasks.find(
        (candidate) => candidate.tempId === task.tempId,
      );
      if (storedTask) storedTask.createdZoomTaskId = result.taskId;
    }
  }

  const succeeded = results.flatMap((result) =>
    result.success
      ? [
          {
            title: result.title,
            taskId: result.taskId,
            assigneeOmitted: result.assigneeOmitted,
          },
        ]
      : [],
  );
  const failed = results.flatMap((result) =>
    result.success
      ? []
      : [{ title: result.title, error: result.error.slice(0, 300) }],
  );

  await input.store.completeApproval(
    input.approvalId,
    succeeded.length > 0 ? "approved" : "failed",
    updatedTasks,
  );
  return { kind: "approved", succeeded, failed };
}
