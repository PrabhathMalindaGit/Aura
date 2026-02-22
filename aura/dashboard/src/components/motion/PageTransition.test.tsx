/* @vitest-environment jsdom */

import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { describe, expect, it } from 'vitest';
import { installMatchMediaMock } from '../../test/mocks';
import { PageTransition } from './PageTransition';

describe('PageTransition', () => {
  it('disables motion classes when reduced motion is preferred', () => {
    installMatchMediaMock((query) => query.includes('prefers-reduced-motion'));

    render(
      <PageTransition transitionKey="/alerts">
        <div>Alerts page</div>
      </PageTransition>,
    );

    const transition = screen.getByTestId('page-transition');
    expect(transition).not.toHaveClass('page-transition--motion');
    expect(transition).not.toHaveClass('page-transition--entering');
  });

  it('applies motion class when reduced motion is not preferred', () => {
    installMatchMediaMock(() => false);

    render(
      <PageTransition transitionKey="/alerts">
        <div>Alerts page</div>
      </PageTransition>,
    );

    expect(screen.getByTestId('page-transition')).toHaveClass('page-transition--motion');
  });
});
