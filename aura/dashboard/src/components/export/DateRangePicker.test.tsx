/* @vitest-environment jsdom */

import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import userEvent from '@testing-library/user-event';
import { useMemo, useState } from 'react';
import { describe, expect, it } from 'vitest';
import { validateDateRange } from '../../utils/datesRange';
import { Button } from '../ui/Button';
import { DateRangePicker } from './DateRangePicker';

function Harness(): JSX.Element {
  const [range, setRange] = useState({ from: '2026-02-10', to: '2026-02-11' });
  const error = useMemo(() => validateDateRange(range), [range]);

  return (
    <div>
      <DateRangePicker range={range} error={error} onChange={setRange} />
      <Button disabled={Boolean(error)}>Download CSV</Button>
    </div>
  );
}

describe('DateRangePicker', () => {
  it('date validation prevents From > To', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    const fromInput = screen.getByLabelText('From');
    await user.clear(fromInput);
    await user.type(fromInput, '2026-02-12');

    expect(screen.getByText('From date cannot be after To date.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Download CSV' })).toBeDisabled();
  });
});
