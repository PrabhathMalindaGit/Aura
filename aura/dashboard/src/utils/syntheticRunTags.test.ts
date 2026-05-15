import { describe, expect, it } from 'vitest';

import {
  containsAuraLatencyBenchmarkMarker,
  sanitizeDashboardPreviewText,
} from './syntheticRunTags';

describe('synthetic run tag dashboard text utilities', () => {
  it('removes provider-send-all run tags while keeping patient text', () => {
    expect(
      sanitizeDashboardPreviewText(
        '[aura-n8n-provider-send-all:4bcf9e6b-08d2-4448-9018-b36ed90002e2] I cant breathe and need urgent help.',
      ),
    ).toBe('I cant breathe and need urgent help.');
  });

  it('removes Aura latency benchmark tags when a preview still reaches display code', () => {
    expect(
      sanitizeDashboardPreviewText(
        '[AURA_LATENCY_BENCH:845047b4-7ff6-4ab5-aec7-608a590ee1c9] I cant breathe and need help. Sample 15.',
      ),
    ).toBe('I cant breathe and need help. Sample 15.');
  });

  it('removes known n8n evidence markers without stripping normal bracketed patient text', () => {
    expect(
      sanitizeDashboardPreviewText(
        '[AURA_N8N_TELEGRAM_RUNTIME:run-1] Please keep [left knee] elevated tonight.',
      ),
    ).toBe('Please keep [left knee] elevated tonight.');
  });

  it('preserves normal patient text that does not match a known synthetic marker', () => {
    expect(
      sanitizeDashboardPreviewText(
        '[care team note] Patient reports dizziness after the afternoon walk.',
      ),
    ).toBe('[care team note] Patient reports dizziness after the afternoon walk.');
  });

  it('keeps latency benchmark detection narrow for filtering synthetic benchmark rows', () => {
    expect(
      containsAuraLatencyBenchmarkMarker(
        '[AURA_LATENCY_BENCH:845047b4-7ff6-4ab5-aec7-608a590ee1c9] sample',
      ),
    ).toBe(true);
    expect(
      containsAuraLatencyBenchmarkMarker(
        '[aura-n8n-provider-send-all:4bcf9e6b-08d2-4448-9018-b36ed90002e2] patient text',
      ),
    ).toBe(false);
  });
});

