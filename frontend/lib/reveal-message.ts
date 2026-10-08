export function revealMessage(messageId: string) {
  const target = document.getElementById(`message-${messageId}`);
  let parent = target?.parentElement;
  while (parent) {
    if (parent instanceof HTMLDetailsElement) parent.open = true;
    parent = parent.parentElement;
  }
}
