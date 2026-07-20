export function shouldSendAiComposerKey(event = {}) {
  return event.key === "Enter"
    && !event.shiftKey
    && !event.isComposing
    && !event.nativeEvent?.isComposing;
}

export function isAiConversationNearBottom(node = {}, threshold = 80) {
  const scrollHeight = Number(node.scrollHeight) || 0;
  const scrollTop = Number(node.scrollTop) || 0;
  const clientHeight = Number(node.clientHeight) || 0;
  return scrollHeight - scrollTop - clientHeight <= threshold;
}
