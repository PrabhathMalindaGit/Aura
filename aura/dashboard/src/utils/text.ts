export interface TruncateResult {
  text: string;
  truncated: boolean;
}

export function truncateText(value: string, maxLength: number): TruncateResult {
  if (value.length <= maxLength) {
    return {
      text: value,
      truncated: false,
    };
  }

  return {
    text: `${value.slice(0, maxLength - 1)}…`,
    truncated: true,
  };
}
