export type IncomingZoomContext = {
  accountId: string;
  channelId: string;
  command: string;
  event: string;
  isDirectMessage: boolean;
  messageId?: string;
  robotJid: string;
  toJid: string;
  userId: string;
  userJid: string;
  userName: string;
};

type ZoomEvent = {
  event?: string;
  callback_url?: string;
  callback_token?: string;
  payload?: Record<string, unknown>;
};

function value(object: Record<string, unknown>, key: string): string {
  const item = object[key];
  return typeof item === "string" ? item : "";
}

function stripLeadingMention(message: string): string {
  return message
    .replace(/^<at[^>]*>.*?<\/at>\s*/i, "")
    .replace(/^@\S+\s*/, "")
    .trim();
}

export function parseZoomEventContext(
  body: ZoomEvent,
): IncomingZoomContext | null {
  const payload = body.payload ?? {};

  if (body.event === "bot_notification") {
    const toJid = value(payload, "toJid");
    return {
      accountId: value(payload, "accountId"),
      channelId: toJid,
      command: value(payload, "cmd").trim(),
      event: body.event,
      isDirectMessage: !toJid.includes("@conference."),
      robotJid: value(payload, "robotJid") || process.env.ZOOM_BOT_JID || "",
      toJid,
      userId: value(payload, "userId"),
      userJid: value(payload, "userJid"),
      userName: value(payload, "userName"),
    };
  }

  if (body.event === "team_chat.app_mention") {
    const object =
      payload.object && typeof payload.object === "object"
        ? (payload.object as Record<string, unknown>)
        : {};
    const channelId = value(object, "channel_id");
    return {
      accountId: value(payload, "account_id"),
      channelId,
      command: stripLeadingMention(value(object, "message")),
      event: body.event,
      isDirectMessage: false,
      messageId: value(object, "message_id"),
      robotJid: process.env.ZOOM_BOT_JID || "",
      toJid: channelId ? `${channelId}@conference.xmpp.zoom.us` : "",
      userId: value(payload, "operator_id"),
      userJid: value(payload, "operator_id")
        ? `${value(payload, "operator_id")}@xmpp.zoom.us`
        : "",
      userName: value(payload, "operator"),
    };
  }

  if (body.event === "interactive_message_actions") {
    const actionItem =
      payload.actionItem && typeof payload.actionItem === "object"
        ? (payload.actionItem as Record<string, unknown>)
        : {};
    const toJid = value(payload, "toJid");
    return {
      accountId: value(payload, "accountId"),
      channelId: toJid,
      command: value(actionItem, "value"),
      event: body.event,
      isDirectMessage: !toJid.includes("@conference."),
      messageId: value(payload, "messageId"),
      robotJid: value(payload, "robotJid") || process.env.ZOOM_BOT_JID || "",
      toJid,
      userId: value(payload, "userId"),
      userJid: value(payload, "userJid"),
      userName: value(payload, "userName"),
    };
  }

  return null;
}

export function isZoomUrlValidation(body: ZoomEvent): body is ZoomEvent & {
  event: "endpoint.url_validation";
  payload: { plainToken: string };
} {
  return (
    body.event === "endpoint.url_validation" &&
    typeof body.payload?.plainToken === "string"
  );
}
