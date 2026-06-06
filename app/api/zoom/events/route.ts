import { NextRequest, NextResponse } from "next/server";
import { extractTasksWithFallback } from "@/lib/ai/extraction";
import { handleChatCommand } from "@/lib/chat/commands";
import {
  createApprovalId,
  getStore,
} from "@/lib/storage/store";
import { processApprovalAction } from "@/lib/zoom/approval";
import { sendZoomMessage } from "@/lib/zoom/client";
import {
  isZoomUrlValidation,
  parseZoomEventContext,
} from "@/lib/zoom/events";
import {
  approvalResultMessage,
  taskReviewMessage,
  textMessage,
} from "@/lib/zoom/messages";
import {
  buildZoomValidationResponse,
  verifyZoomWebhookSignature,
} from "@/lib/zoom/webhook";

export const runtime = "nodejs";
export const maxDuration = 60;

type ZoomEventBody = {
  event?: string;
  payload?: Record<string, unknown>;
};

function handleInteractiveAction(
  actionValue: string,
  userId: string,
): ReturnType<typeof processApprovalAction> | null {
  const [action, approvalId] = actionValue.split(":", 2);
  if (!approvalId || !["approve", "cancel"].includes(action)) return null;
  return processApprovalAction({
    approvalId,
    action: action as "approve" | "cancel",
    userId,
    store: getStore(),
  });
}

export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  let body: ZoomEventBody;

  try {
    body = JSON.parse(rawBody) as ZoomEventBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (isZoomUrlValidation(body)) {
    return NextResponse.json(
      buildZoomValidationResponse(body.payload.plainToken),
    );
  }

  const validSignature = verifyZoomWebhookSignature({
    rawBody,
    timestamp: request.headers.get("x-zm-request-timestamp"),
    signature: request.headers.get("x-zm-signature"),
  });
  if (!validSignature) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  const context = parseZoomEventContext(body);
  if (!context) {
    return NextResponse.json({ ok: true, ignored: true });
  }

  try {
    if (
      !context.accountId ||
      !context.robotJid ||
      !context.toJid ||
      !context.userId
    ) {
      throw new Error("Zoom event is missing required account or JID fields.");
    }

    const messageContext = {
      accountId: context.accountId,
      toJid: context.toJid,
      robotJid: context.robotJid,
      userJid: context.userJid || undefined,
      replyTo: context.messageId,
    };

    if (context.event === "interactive_message_actions") {
      const resultPromise = handleInteractiveAction(
        context.command,
        context.userId,
      );
      if (!resultPromise) {
        await sendZoomMessage(
          messageContext,
          textMessage("Unsupported action."),
        );
        return NextResponse.json({ ok: true });
      }
      const result = await resultPromise;
      if (result.kind === "cancelled") {
        await sendZoomMessage(
          messageContext,
          textMessage("登録をキャンセルしました。"),
        );
      } else if (result.kind === "forbidden") {
        await sendZoomMessage(
          messageContext,
          textMessage("この操作はタスク抽出を依頼したユーザーのみ実行できます。"),
        );
      } else if (result.kind === "unavailable") {
        await sendZoomMessage(
          messageContext,
          textMessage("この承認は期限切れ、またはすでに処理済みです。"),
        );
      } else {
        await sendZoomMessage(
          messageContext,
          approvalResultMessage(result),
        );
      }
      return NextResponse.json({ ok: true });
    }

    const commandResult = await handleChatCommand(
      context.command,
      {
        accountId: context.accountId,
        userId: context.userId,
        isDirectMessage: context.isDirectMessage,
      },
      getStore(),
    );
    if (commandResult.handled) {
      await sendZoomMessage(
        messageContext,
        textMessage(commandResult.text),
      );
      return NextResponse.json({ ok: true });
    }

    if (!context.command.trim()) {
      await sendZoomMessage(
        messageContext,
        textMessage(
          "会議メモを一緒に送ってください。\n\n例:\n/meetingtask 田中さんが明日までにZoom API権限を確認する",
        ),
      );
      return NextResponse.json({ ok: true });
    }

    await sendZoomMessage(
      messageContext,
      textMessage("会議メモを分析しています。しばらくお待ちください。"),
    );

    const extraction = await extractTasksWithFallback({
      accountId: context.accountId,
      meetingText: context.command,
      language: "auto",
      store: getStore(),
    });
    const creatableTasks = extraction.tasks.filter(
      (task) => task.shouldCreateTask,
    );

    if (creatableTasks.length === 0) {
      await sendZoomMessage(
        messageContext,
        textMessage(
          "明確なタスクは見つかりませんでした。\n議論中または未確定の内容はタスクとして抽出していません。",
        ),
      );
      return NextResponse.json({ ok: true });
    }

    const approvalId = createApprovalId();
    await getStore().createApproval({
      id: approvalId,
      accountId: context.accountId,
      channelId: context.channelId,
      toJid: context.toJid,
      robotJid: context.robotJid,
      userJid: context.userJid,
      requestedBy: context.userId,
      tasks: extraction.tasks,
      excludedItems: extraction.excludedItems,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    });

    await sendZoomMessage(
      messageContext,
      taskReviewMessage({
        approvalId,
        tasks: extraction.tasks,
        excludedItems: extraction.excludedItems,
        provider: extraction.provider,
        model: extraction.model,
      }),
    );
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown processing error";
    console.error("Zoom event processing failed:", message.slice(0, 500));

    try {
      if (context.accountId && context.robotJid && context.toJid) {
        await sendZoomMessage(
          {
            accountId: context.accountId,
            toJid: context.toJid,
            robotJid: context.robotJid,
            userJid: context.userJid || undefined,
          },
          textMessage(
            "処理に失敗しました。AI設定を確認して、もう一度お試しください。",
          ),
        );
      }
    } catch {
      // The webhook still returns 200 to avoid duplicate task extraction retries.
    }
    return NextResponse.json({ ok: false });
  }
}
