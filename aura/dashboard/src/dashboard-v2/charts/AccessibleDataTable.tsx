import type { ReactNode } from 'react';
import { DashboardV2Table, DashboardV2TableFrame } from '../primitives/Table';

interface DashboardV2AccessibleDataTableProps {
  caption: ReactNode;
  summary?: ReactNode;
  children: ReactNode;
}

export function DashboardV2AccessibleDataTable({
  caption,
  summary,
  children,
}: DashboardV2AccessibleDataTableProps): JSX.Element {
  return (
    <DashboardV2TableFrame caption={caption} summary={summary}>
      <DashboardV2Table>{children}</DashboardV2Table>
    </DashboardV2TableFrame>
  );
}
