export interface TruncateResult {
  text: string;
  truncated: boolean;
}

export function truncateText(value: unknown, maxLength: number): TruncateResult {
  const text = typeof value === 'string' ? value : '';

  if (text.length <= maxLength) {
    return {
      text,
      truncated: false,
    };
  }

  return {
    text: `${text.slice(0, maxLength - 1)}…`,
    truncated: true,
  };
}
