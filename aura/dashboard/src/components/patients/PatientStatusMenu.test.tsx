/* @vitest-environment jsdom */

import { cleanup, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it } from 'vitest';
import { PatientStatusMenu } from './PatientStatusMenu';

describe('PatientStatusMenu', () => {
  afterEach(() => {
    cleanup();
  });

  it('shows the current status as read-only and explains why editing is unavailable', () => {
    render(<PatientStatusMenu currentStatus="on_hold" />);

    expect(screen.getByText('Status')).toBeInTheDocument();
    expect(screen.getByText('On hold')).toBeInTheDocument();
    expect(
      screen.getByText('Editing stays unavailable until the patient status endpoint is connected.'),
    ).toBeInTheDocument();

    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Save' })).not.toBeInTheDocument();
  });
});
