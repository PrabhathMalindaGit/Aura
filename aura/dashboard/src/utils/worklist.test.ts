import { describe, expect, it } from 'vitest';
import { formatExercisesPct } from './worklist';

describe('formatExercisesPct', () => {
  it('formats ratio values as percentages', () => {
    expect(formatExercisesPct(0.81)).toBe('81%');
    expect(formatExercisesPct(0.4)).toBe('40%');
  });

  it('keeps whole-number percentage values from being multiplied again', () => {
    expect(formatExercisesPct(81)).toBe('81%');
    expect(formatExercisesPct(100)).toBe('100%');
  });

  it('returns a dash for invalid values', () => {
    expect(formatExercisesPct(undefined)).toBe('—');
    expect(formatExercisesPct(Number.NaN)).toBe('—');
  });
});
