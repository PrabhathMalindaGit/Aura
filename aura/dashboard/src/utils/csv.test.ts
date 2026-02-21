import { describe, expect, it } from 'vitest';
import { toCsv } from './csv';

describe('csv utils', () => {
  it('escapes quotes, commas, and new lines', () => {
    const csv = toCsv(
      [
        {
          id: '1',
          reason: 'Pain, severe',
          note: 'Line one\nLine "two"',
        },
      ],
      [
        { key: 'id', header: 'id' },
        { key: 'reason', header: 'reason' },
        { key: 'note', header: 'note' },
      ],
    );

    expect(csv).toContain('id,reason,note');
    expect(csv).toContain('1,"Pain, severe","Line one\nLine ""two"""');
  });

  it('keeps header order deterministic', () => {
    const csv = toCsv(
      [{ a: 'first', b: 'second' }],
      [
        { key: 'b', header: 'B' },
        { key: 'a', header: 'A' },
      ],
    );

    const [header, row] = csv.split('\r\n');
    expect(header).toBe('B,A');
    expect(row).toBe('second,first');
  });

  it('serializes empty values as empty cells', () => {
    const csv = toCsv(
      [{ id: '1', reason: null, status: undefined }],
      [
        { key: 'id', header: 'id' },
        { key: 'reason', header: 'reason' },
        { key: 'status', header: 'status' },
      ],
    );

    const lines = csv.split('\r\n');
    expect(lines[1]).toBe('1,,');
  });
});
