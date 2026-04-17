import type { HTMLAttributes, ReactNode, TableHTMLAttributes } from 'react';
import { cn } from '../../utils/cn';

interface DashboardV2TableFrameProps extends HTMLAttributes<HTMLDivElement> {
  caption?: ReactNode;
  summary?: ReactNode;
  children: ReactNode;
}

export function DashboardV2TableFrame({
  className,
  caption,
  summary,
  children,
  ...props
}: DashboardV2TableFrameProps): JSX.Element {
  return (
    <div className={cn('v2-table-frame', className)} {...props}>
      {caption ? <div className="v2-table-frame__caption">{caption}</div> : null}
      {summary ? <div className="v2-table-frame__summary">{summary}</div> : null}
      <div className="v2-table-frame__scroll">{children}</div>
    </div>
  );
}

export function DashboardV2Table({
  className,
  ...props
}: TableHTMLAttributes<HTMLTableElement>): JSX.Element {
  return <table className={cn('v2-table', className)} {...props} />;
}

