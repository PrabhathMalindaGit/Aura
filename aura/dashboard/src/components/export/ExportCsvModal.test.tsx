/* @vitest-environment jsdom */

import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { describe, expect, it, vi } from 'vitest';
import { ExportCsvModal } from './ExportCsvModal';

describe('ExportCsvModal', () => {
  it('disables download action when no rows are available', () => {
    render(
      <ExportCsvModal
        open
        title="Export Alerts CSV"
        range={{ from: '2026-02-01', to: '2026-02-07' }}
        summary="Exporting 0 alerts from 2026-02-01 to 2026-02-07."
        downloadDisabled
        disableReason="No data in selected range."
        onRangeChange={vi.fn()}
        onClose={vi.fn()}
        onDownload={vi.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: 'Download CSV' })).toBeDisabled();
  });
});
