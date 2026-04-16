/* @vitest-environment jsdom */

import { cleanup, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TriggeringEventPanel } from './TriggeringEventPanel';

afterEach(() => {
  cleanup();
});

describe('TriggeringEventPanel', () => {
  it('keeps normal triggering text truncation intact', async () => {
    const user = userEvent.setup();
    const longMessage = 'A'.repeat(270);

    render(
      <TriggeringEventPanel
        event={{
          type: 'chat',
          id: 'msg-1',
          text: longMessage,
          createdAt: '2026-04-16T07:00:00.000Z',
          role: 'user',
        }}
        loading={false}
        onFetchDetails={vi.fn()}
      />,
    );

    expect(screen.getByText(`${'A'.repeat(259)}…`)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Show more' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Show more' }));

    expect(screen.getByText(longMessage)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Show less' })).toBeInTheDocument();
  });

  it('uses the source message text when legacy chat data omits the direct text field', () => {
    render(
      <TriggeringEventPanel
        event={{
          type: 'chat',
          messageWindow: [
            {
              id: 'msg-before',
              createdAt: '2026-04-16T06:55:00.000Z',
              role: 'user',
              text: 'Earlier context',
            },
            {
              id: 'msg-target',
              createdAt: '2026-04-16T07:00:00.000Z',
              role: 'user',
              text: 'I feel unsafe and need help now.',
            },
          ],
        }}
        loading={false}
        onFetchDetails={vi.fn()}
        sourceId="msg-target"
      />,
    );

    expect(screen.getByText('I feel unsafe and need help now.')).toBeInTheDocument();
    expect(screen.queryByText('No triggering event details available')).not.toBeInTheDocument();
  });

  it('renders a calm fallback when no triggering text is usable', () => {
    render(
      <TriggeringEventPanel
        event={{
          type: 'chat',
          id: 'msg-2',
          text: undefined,
          createdAt: '2026-04-16T07:05:00.000Z',
          role: 'user',
        } as never}
        loading={false}
        onFetchDetails={vi.fn()}
      />,
    );

    expect(screen.getByText('No triggering event details available')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Show more' })).not.toBeInTheDocument();
  });
});
