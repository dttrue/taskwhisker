function datePart(value) {
  if (!value) return "-";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "-" : date.toISOString();
}

export function createThreadPollingFingerprint({ status, messages = [] }) {
  const latestMessage = messages[messages.length - 1] ?? null;

  return [
    "thread-v1",
    status || "-",
    messages.length,
    latestMessage?.id || "-",
    datePart(latestMessage?.createdAt),
  ].join(":");
}

export function createThreadPollingFingerprintFromMetadata({
  status,
  messageCount = 0,
  latestMessage = null,
}) {
  return [
    "thread-v1",
    status || "-",
    messageCount,
    latestMessage?.id || "-",
    datePart(latestMessage?.createdAt),
  ].join(":");
}

export function createInboxPollingFingerprint(conversations = []) {
  const entries = conversations
    .map((conversation) => {
      const latestMessage = conversation.messages?.[0] ?? null;

      return [
        conversation.id,
        conversation.booking?.status || "-",
        latestMessage?.id || "-",
        datePart(latestMessage?.createdAt),
        Number(conversation.unreadCount || 0),
      ].join("~");
    })
    .sort();

  return `inbox-v1:${entries.length}:${entries.join("|")}`;
}
