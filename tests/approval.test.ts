import { describe, expect, it } from "vitest";
import { processApprovalAction } from "@/lib/zoom/approval";
import { MemoryStore } from "@/lib/storage/store";

describe("approval actions", () => {
  it("allows only the requester and prevents duplicate execution", async () => {
    const store = new MemoryStore();
    await store.createApproval({
      id: "approval_test",
      accountId: "account",
      channelId: "channel",
      toJid: "channel@conference.xmpp.zoom.us",
      robotJid: "bot@xmpp.zoom.us",
      userJid: "user@xmpp.zoom.us",
      requestedBy: "requester",
      tasks: [
        {
          tempId: "task_1",
          title: "Check API scope",
          description: "",
          assigneeName: null,
          assigneeEmail: null,
          dueDate: null,
          priority: "Medium",
          status: "To do",
          evidence: "Check API scope",
          confidence: 0.9,
          shouldCreateTask: true,
        },
      ],
      excludedItems: [],
      expiresAt: new Date(Date.now() + 60_000),
    });

    expect(
      await processApprovalAction({
        approvalId: "approval_test",
        action: "approve",
        userId: "other-user",
        store,
      }),
    ).toEqual({ kind: "forbidden" });

    let createCount = 0;
    const taskCreator = async () => {
      createCount += 1;
      return {
        success: true as const,
        taskId: "zoom-task",
        title: "Check API scope",
        assigneeOmitted: false,
      };
    };

    const first = await processApprovalAction({
      approvalId: "approval_test",
      action: "approve",
      userId: "requester",
      store,
      taskCreator,
    });
    const second = await processApprovalAction({
      approvalId: "approval_test",
      action: "approve",
      userId: "requester",
      store,
      taskCreator,
    });

    expect(first.kind).toBe("approved");
    expect(second).toEqual({ kind: "unavailable" });
    expect(createCount).toBe(1);
  });
});
