import type { KeyboardEvent, ReactNode } from 'react';
import { cn } from '../../utils/cn';

export interface TableColumn<T> {
  key: string;
  header: ReactNode;
  render: (row: T) => ReactNode;
  className?: string;
}

interface TableProps<T> {
  ariaLabel: string;
  data: T[];
  columns: Array<TableColumn<T>>;
  rowKey: (row: T) => string;
  caption?: string;
  onRowClick?: (row: T) => void;
  emptyState?: ReactNode;
}

function handleRowKeyDown<T>(
  event: KeyboardEvent<HTMLTableRowElement>,
  row: T,
  onRowClick?: (row: T) => void,
): void {
  if (!onRowClick) {
    return;
  }

  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault();
    onRowClick(row);
  }
}

export function Table<T>({
  ariaLabel,
  data,
  columns,
  rowKey,
  caption,
  onRowClick,
  emptyState,
}: TableProps<T>): JSX.Element {
  if (data.length === 0) {
    return <>{emptyState ?? null}</>;
  }

  return (
    <div className="table-wrap" role="region" aria-label={`${ariaLabel} table container`}>
      <table className="table" aria-label={ariaLabel}>
        {caption ? <caption className="table__caption">{caption}</caption> : null}
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column.key} scope="col" className={cn('table__head', column.className)}>
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((row) => (
            <tr
              key={rowKey(row)}
              className={cn('table__row', onRowClick && 'table__row--clickable')}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              onKeyDown={(event) => handleRowKeyDown(event, row, onRowClick)}
              tabIndex={onRowClick ? 0 : undefined}
              role={onRowClick ? 'button' : undefined}
            >
              {columns.map((column) => (
                <td key={column.key} className={cn('table__cell', column.className)}>
                  {column.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
