import { describe, expect, it } from 'vitest';
import { truncateText } from './text';

describe('truncateText', () => {
  it('keeps normal string behavior intact', () => {
    expect(truncateText('Short note', 20)).toEqual({
      text: 'Short note',
      truncated: false,
    });

    expect(truncateText('ABCDEFGHIJ', 5)).toEqual({
      text: 'ABCD…',
      truncated: true,
    });
  });

  it('returns an empty string for missing or invalid values', () => {
    expect(truncateText(undefined, 10)).toEqual({
      text: '',
      truncated: false,
    });

    expect(truncateText(null, 10)).toEqual({
      text: '',
      truncated: false,
    });

    expect(truncateText(42, 10)).toEqual({
      text: '',
      truncated: false,
    });
  });
});
