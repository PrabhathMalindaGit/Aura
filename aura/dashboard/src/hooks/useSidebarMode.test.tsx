/* @vitest-environment jsdom */

import { cleanup, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SIDEBAR_MODE_STORAGE_KEY, useSidebarMode } from './useSidebarMode';

interface ProbeProps {
  isMobile: boolean;
  isTablet: boolean;
  isDesktop: boolean;
}

function SidebarModeProbe({ isMobile, isTablet, isDesktop }: ProbeProps): JSX.Element {
  const { mode, toggleMode } = useSidebarMode({
    isMobile,
    isTablet,
    isDesktop,
  });

  return (
    <div>
      <span data-testid="mode">{mode}</span>
      <button type="button" onClick={toggleMode}>
        Toggle
      </button>
    </div>
  );
}

describe('useSidebarMode', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(() => {
    cleanup();
  });

  it('defaults to expanded on desktop and persists icon mode after toggle', async () => {
    const user = userEvent.setup();
    const { unmount } = render(<SidebarModeProbe isMobile={false} isTablet={false} isDesktop={true} />);

    expect(screen.getByTestId('mode')).toHaveTextContent('expanded');

    await user.click(screen.getByRole('button', { name: 'Toggle' }));
    expect(screen.getByTestId('mode')).toHaveTextContent('icon');
    expect(window.localStorage.getItem(SIDEBAR_MODE_STORAGE_KEY)).toBe('icon');

    unmount();
    render(<SidebarModeProbe isMobile={false} isTablet={false} isDesktop={true} />);
    expect(screen.getByTestId('mode')).toHaveTextContent('icon');
  });

  it('defaults to icon on tablet when storage is empty', () => {
    render(<SidebarModeProbe isMobile={false} isTablet={true} isDesktop={false} />);
    expect(screen.getByTestId('mode')).toHaveTextContent('icon');
  });
});

