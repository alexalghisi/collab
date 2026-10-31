// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@expo/vector-icons', () => ({
  Ionicons: () => null,
}));

import { InvitePanel } from './InvitePanel';

afterEach(cleanup);

function renderPanel(
  onSend = vi.fn(async () => ({ kind: 'phone' as const, value: '+40770763175' })),
) {
  render(<InvitePanel roomId="ada-123" hostName="Ada" onSend={onSend} onClose={() => undefined} />);
  return onSend;
}

describe('InvitePanel', () => {
  it('keeps Send invite for a complete phone number and adds WhatsApp beside it', () => {
    renderPanel();
    const input = screen.getByPlaceholderText('name@email.com or +40 721 123 456');

    fireEvent.change(input, { target: { value: '+4077076' } });
    expect(screen.getByRole('button', { name: 'Send invite' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Send on WhatsApp' })).toBeNull();

    fireEvent.change(input, { target: { value: '+40770763175' } });
    expect(screen.getByRole('button', { name: 'Send invite' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Send on WhatsApp' })).toBeTruthy();
  });

  it('sends the text message when Send invite is pressed on a full number', () => {
    const onSend = renderPanel();
    fireEvent.change(screen.getByPlaceholderText('name@email.com or +40 721 123 456'), {
      target: { value: '+40770763175' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send invite' }));
    expect(onSend).toHaveBeenCalledWith('+40770763175');
  });
});
