import { ChevronRight, Clock3 } from 'lucide-react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { DashboardV2Badge } from '../primitives/Badge';
import { DashboardV2Button } from '../primitives/Button';
import { DashboardV2Disclosure } from '../primitives/Disclosure';
import { DashboardV2ClinicianQuietState } from './ClinicianQuietState';

describe('shared clinician patterns', () => {
  it('keeps action buttons visually distinct from status badges', () => {
    render(
      <div>
        <DashboardV2Button
          tone="row"
          size="sm"
          trailingIcon={<ChevronRight size={14} />}
        >
          Open patient
        </DashboardV2Button>
        <DashboardV2Badge tone="delayed" size="sm" icon={Clock3}>
          Response delayed
        </DashboardV2Badge>
      </div>,
    );

    const action = screen.getByRole('button', { name: /open patient/i });
    const status = screen.getByText('Response delayed').closest('.v2-badge');

    expect(action).toHaveClass('v2-button', 'v2-button--row');
    expect(status).toHaveClass('v2-badge', 'v2-badge--delayed', 'v2-badge--sm');
  });

  it('renders quiet states with calm copy and an optional next action', () => {
    render(
      <DashboardV2ClinicianQuietState
        eyebrow="Quiet review lane"
        title="No guidance suggestions are waiting"
        description="Monitoring remains active and new follow-up suggestions will appear here when review is needed."
        action={
          <DashboardV2Button tone="quiet" size="sm">
            Refresh
          </DashboardV2Button>
        }
      />,
    );

    expect(screen.getByText('Quiet review lane')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'No guidance suggestions are waiting' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Refresh' })).toBeInTheDocument();
  });

  it('keeps disclosures accessible and hides supporting explanation by default', () => {
    render(
      <DashboardV2Disclosure
        title="Trust & provenance"
        summary="Overview only. Detailed review stays in destination routes."
      >
        <p>Shared clinician review context stays behind disclosure by default.</p>
      </DashboardV2Disclosure>,
    );

    const trigger = screen.getByRole('button', { name: /trust & provenance/i });

    expect(trigger).toBeInTheDocument();
    expect(screen.getByText('Shared clinician review context stays behind disclosure by default.')).not.toBeVisible();
  });
});
