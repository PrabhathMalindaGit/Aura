export interface CsvColumnSpec<Row> {
  key: string;
  header: string;
  accessor?: (row: Row) => unknown;
}

function stringifyValue(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }

  if (typeof value === 'string') {
    return value;
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }

  if (Array.isArray(value)) {
    return value.map((item) => stringifyValue(item)).join('; ');
  }

  return JSON.stringify(value);
}

export function escapeCsvCell(value: unknown): string {
  const stringValue = stringifyValue(value);

  if (!/[",\r\n]/.test(stringValue)) {
    return stringValue;
  }

  return `"${stringValue.replace(/"/g, '""')}"`;
}

export function toCsv<Row>(
  rows: Row[],
  columns: CsvColumnSpec<Row>[],
  lineEnding: '\r\n' | '\n' = '\r\n',
): string {
  const headers = columns.map((column) => escapeCsvCell(column.header)).join(',');
  const body = rows.map((row) => {
    return columns
      .map((column) => {
        const value = column.accessor ? column.accessor(row) : (row as Record<string, unknown>)[column.key];
        return escapeCsvCell(value);
      })
      .join(',');
  });

  return [headers, ...body].join(lineEnding);
}

export function downloadCsv(filename: string, csvString: string): boolean {
  const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8' });
  return downloadBlob(filename, blob);
}

export function downloadBlob(filename: string, blob: Blob): boolean {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return false;
  }

  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');

  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);

  return true;
}
