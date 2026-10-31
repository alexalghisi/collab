// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { InvitePanel } from './InvitePanel';

vi.mock('@expo/vector-icons', () => ({
  Ionicons: () => null,
}));

afterEach(cleanup);

function renderPanel(
  onSend = vi.fn(async () => ({ kind: 'phone' as const, value: '+40770763175' })),
) {
  render(<InvitePanel roomId="ada-123" hostName="Ada" onSend={onSend} onClose={() => undefined} />);
  return onSend;
}

describe('InvitePanel', () => {
  it('keeps Send invite until the number is complete, then offers SMS and WhatsApp', () => {
    renderPanel();
    const input = screen.getByPlaceholderText('name@email.com or +40 721 123 456');

    fireEvent.change(input, { target: { value: '+4077076' } });
    expect(screen.getByRole('button', { name: 'Send invite' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Send on WhatsApp' })).toBeNull();

    fireEvent.change(input, { target: { value: '+40770763175' } });
    expect(screen.getByRole('button', { name: 'Send SMS' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Send on WhatsApp' })).toBeTruthy();
  });

  it('sends a phone number as an SMS instead of opening WhatsApp', async () => {
    const onSend = vi.fn(async () => ({ kind: 'phone' as const, value: '+40721123456' }));
    render(
      <InvitePanel roomId="room-1" hostName="Ada" onSend={onSend} onClose={() => undefined} />,
    );

    fireEvent.change(screen.getByPlaceholderText('name@email.com or +40 721 123 456'), {
      target: { value: '+40 721 123 456' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send SMS' }));

    expect(onSend).toHaveBeenCalledWith('+40 721 123 456');
    expect(await screen.findByText('SMS sent to +40721123456.')).toBeTruthy();
  });

  it('sends an email through the same invite action', async () => {
    const onSend = vi.fn(async () => ({ kind: 'email' as const, value: 'ada@example.com' }));
    render(
      <InvitePanel roomId="room-1" hostName="Ada" onSend={onSend} onClose={() => undefined} />,
    );

    fireEvent.change(screen.getByPlaceholderText('name@email.com or +40 721 123 456'), {
      target: { value: 'ada@example.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send invite' }));

    expect(onSend).toHaveBeenCalledWith('ada@example.com');
    expect(await screen.findByText('Email sent to ada@example.com.')).toBeTruthy();
  });
});
