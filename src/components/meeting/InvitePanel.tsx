import { createElement, useState } from 'react';
import { Platform, StyleSheet, Text, TextInput, View } from 'react-native';
import { InviteError, type ParsedContact } from '../../meeting/contact';
import { buildInviteLink, shareInvite } from '../../meeting/invite';
import { colors } from '../../theme';
import { Button } from '../ui/Button';
import { SidePanel } from './SidePanel';

export interface InvitePanelProps {
  roomId: string;
  onSend: (input: string) => Promise<ParsedContact>;
  onClose: () => void;
}

export function InvitePanel({ roomId, onSend, onClose }: InvitePanelProps) {
  const [contact, setContact] = useState('');
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const send = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    setStatus(null);
    try {
      const sent = await onSend(contact);
      setStatus(
        sent.kind === 'email' ? `Email sent to ${sent.value}.` : `SMS sent to ${sent.value}.`,
      );
      setContact('');
    } catch (cause) {
      setError(cause instanceof InviteError ? cause.message : 'The invite could not be sent.');
    } finally {
      setBusy(false);
    }
  };

  const copy = async (): Promise<void> => {
    setError(null);
    try {
      await shareInvite(roomId);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError('Could not copy the link. Copy it from the address bar instead.');
    }
  };

  return (
    <SidePanel title="Invite" onClose={onClose}>
      <View style={styles.body}>
        <Text style={styles.lede}>
          Send the join link by email or SMS. The other person gets a message they can open to join
          this call.
        </Text>
        <TextInput
          style={styles.input}
          value={contact}
          onChangeText={setContact}
          onSubmitEditing={() => void send()}
          placeholder="name@email.com or +40 721 123 456"
          placeholderTextColor={colors.textSubtle}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="default"
          editable={!busy}
        />
        <Button
          label={busy ? 'Sending…' : 'Send invite'}
          icon="send"
          onPress={() => void send()}
          disabled={busy || contact.trim() === ''}
        />
        {status && <Text style={styles.status}>{status}</Text>}
        {error && <Text style={styles.error}>{error}</Text>}
        <View style={styles.copy}>
          <Text style={styles.copyHint}>Or share this link yourself.</Text>
          {Platform.OS === 'web' ? (
            createElement(
              'a',
              {
                href: buildInviteLink(roomId),
                target: '_blank',
                rel: 'noopener noreferrer',
                style: {
                  color: '#93c5fd',
                  fontSize: 13,
                  lineHeight: '18px',
                  textDecoration: 'underline',
                  wordBreak: 'break-all',
                },
              },
              buildInviteLink(roomId),
            )
          ) : (
            <Text selectable style={styles.link}>
              {buildInviteLink(roomId)}
            </Text>
          )}
          <Button
            label={copied ? 'Copied' : 'Copy link'}
            icon={copied ? 'checkmark' : 'link-outline'}
            variant="secondary"
            compact
            onPress={() => void copy()}
          />
        </View>
      </View>
    </SidePanel>
  );
}

const styles = StyleSheet.create({
  body: {
    padding: 16,
    gap: 12,
  },
  lede: {
    color: colors.textMuted,
    fontSize: 14,
    lineHeight: 20,
  },
  input: {
    backgroundColor: colors.background,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 10,
    color: colors.text,
    fontSize: 15,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  status: {
    color: colors.success,
    fontSize: 13,
  },
  error: {
    color: '#f87171',
    fontSize: 13,
  },
  copy: {
    marginTop: 8,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    gap: 10,
  },
  copyHint: {
    color: colors.textSubtle,
    fontSize: 13,
  },
  link: {
    color: colors.text,
    fontSize: 13,
    lineHeight: 18,
  },
});
