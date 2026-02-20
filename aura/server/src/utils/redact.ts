export function redactText(text?: string | null): string {
  if (text == null) {
    return "";
  }

  const singleLine = text.replace(/\r?\n/g, " ");

  if (singleLine.length <= 40) {
    return singleLine;
  }

  return `${singleLine.slice(0, 40)}…`;
}
