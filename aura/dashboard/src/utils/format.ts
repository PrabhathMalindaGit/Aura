export function formatDateKey(dateKey: string): string {
  const parsed = Date.parse(`${dateKey}T00:00:00.000Z`);
  if (Number.isNaN(parsed)) {
    return dateKey;
  }

  return new Date(parsed).toLocaleDateString([], {
    month: 'short',
    day: '2-digit',
    year: 'numeric',
  });
}

export function formatDateKeyShort(dateKey: string): string {
  const parsed = Date.parse(`${dateKey}T00:00:00.000Z`);
  if (Number.isNaN(parsed)) {
    return dateKey;
  }

  return new Date(parsed).toLocaleDateString([], {
    month: 'short',
    day: '2-digit',
  });
}

export function formatPainValue(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return '—';
  }

  return `${value.toFixed(1)}/10`;
}

export function formatMoodValue(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return '—';
  }

  return value.toFixed(1);
}

export function formatPercent(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return '—';
  }

  const normalized = value <= 1 ? value * 100 : value;
  return `${Math.round(normalized)}%`;
}

export function formatMedication(value: boolean | null | undefined): string {
  if (value === null || value === undefined) {
    return '—';
  }

  return value ? 'Taken' : 'Not taken';
}

export function formatNumber(value: number | null | undefined, digits: number = 1): string {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return '—';
  }

  return value.toFixed(digits);
}
