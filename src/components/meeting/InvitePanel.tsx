import { createElement, useState } from 'react';
import { Linking, Platform, StyleSheet, Text, TextInput, View } from 'react-native';
import { InviteError, inviteCopy, parseContact, type ParsedContact } from '../../meeting/contact';
import { buildInviteLink, shareInvite } from '../../meeting/invite';
import {
  WHATSAPP_NEEDS_COUNTRY_CODE,
  whatsappInviteUrl,
  whatsappNumber,
} from '../../meeting/whatsapp';
import { colors } from '../../theme';
import { Button } from '../ui/Button';
import { SidePanel } from './SidePanel';

export interface InvitePanelProps {
  roomId: string;
  hostName?: string;
  onSend: (input: string) => Promise<ParsedContact>;
  onClose: () => void;
}

export function InvitePanel({ roomId, hostName = '', onSend, onClose }: InvitePanelProps) {
  const [contact, setContact] = useState('');
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const typed = parseContact(contact);
  const message = (): string => inviteCopy(roomId, hostName, buildInviteLink(roomId));

  const openWhatsApp = (phone?: string): void => {
    setError(null);
    setStatus(null);
    if (phone && whatsappNumber(phone) === null) {
      setError(WHATSAPP_NEEDS_COUNTRY_CODE);
      return;
    }
    void Linking.openURL(whatsappInviteUrl(message(), phone));
    setStatus(
      phone
        ? `WhatsApp is open with the invite for ${phone.trim()}. Press send there.`
        : 'WhatsApp is open with the invite. Pick who it goes to and press send.',
    );
    if (phone) {
      setContact('');
    }
  };

  const sendEmail = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    setStatus(null);
    try {
      const sent = await onSend(contact);
      setStatus(`Email sent to ${sent.value}.`);
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
          Send the join link on WhatsApp or by email. The other person gets a message they can open
          to join this call.
        </Text>
        <TextInput
          style={styles.input}
          value={contact}
          onChangeText={setContact}
          onSubmitEditing={() =>
            typed?.kind === 'phone' ? openWhatsApp(contact) : void sendEmail()
          }
          placeholder="name@email.com or +40 721 123 456"
          placeholderTextColor={colors.textSubtle}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="default"
          editable={!busy}
        />
        {typed?.kind === 'phone' ? (
          <Button
            label="Send on WhatsApp"
            icon="logo-whatsapp"
            onPress={() => openWhatsApp(contact)}
          />
        ) : (
          <Button
            label={busy ? 'Sending…' : 'Send invite'}
            icon="send"
            onPress={() => void sendEmail()}
            disabled={busy || contact.trim() === ''}
          />
        )}
        <Button
          label="Pick someone in WhatsApp"
          icon="logo-whatsapp"
          variant="secondary"
          onPress={() => openWhatsApp()}
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
