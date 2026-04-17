import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { DashboardV2ShellFrame } from './ShellFrame';
import { DASHBOARD_V2_MAIN_ID, DASHBOARD_V2_RAIL_ID } from '../foundation/a11y';

describe('DashboardV2ShellFrame', () => {
  it('renders skip links and the required landmarks', () => {
    render(
      <DashboardV2ShellFrame
        bannerMeta={<div>Banner</div>}
        contextualRail={<div>Rail</div>}
        footer={<div>Footer</div>}
        navigation={<nav aria-label="Primary navigation">Nav</nav>}
        search={<form><input aria-label="search" /></form>}
      >
        <div>Main content</div>
      </DashboardV2ShellFrame>,
    );

    expect(screen.getByRole('link', { name: 'Skip to main content' })).toHaveAttribute('href', `#${DASHBOARD_V2_MAIN_ID}`);
    expect(screen.getByRole('banner')).toBeInTheDocument();
    expect(screen.getByRole('search', { name: 'Quick open workspace search' })).toBeInTheDocument();
    expect(screen.getByRole('main')).toHaveAttribute('id', DASHBOARD_V2_MAIN_ID);
    expect(screen.getByRole('complementary', { name: 'Contextual governance rail' })).toHaveAttribute('id', DASHBOARD_V2_RAIL_ID);
    expect(screen.getByRole('contentinfo')).toBeInTheDocument();
  });
});
