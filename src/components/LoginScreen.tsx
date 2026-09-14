import { useState } from 'react';
import { Pressable, SafeAreaView, StyleSheet, Text, TextInput, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { MIN_PASSWORD_LENGTH } from '../auth/credentials';
import type { Credentials, SignUpDraft } from '../auth/types';
import { colors } from '../theme';
import { Button } from './ui/Button';

type Mode = 'signIn' | 'signUp';

export interface LoginScreenProps {
  pending: boolean;
  error: string | null;
  onSignIn: (credentials: Credentials) => void;
  onSignUp: (draft: SignUpDraft) => void;
}

/**
 * The door to the app: nobody reaches a meeting without an account here, which
 * is what gives every participant a name the calendar can invite.
 */
export function LoginScreen({ pending, error, onSignIn, onSignUp }: LoginScreenProps) {
  const [mode, setMode] = useState<Mode>('signIn');
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const signingUp = mode === 'signUp';
  const ready =
    email.trim() !== '' && password !== '' && (!signingUp || displayName.trim() !== '') && !pending;

  const submit = () => {
    if (!ready) {
      return;
    }
    if (signingUp) {
      onSignUp({ displayName, email, password });
      return;
    }
    onSignIn({ email, password });
  };

  return (
    <SafeAreaView style={styles.screen}>
      <StatusBar style="light" />
      <View style={styles.container}>
        <Text style={styles.brand}>Collab</Text>
        <Text style={styles.subtitle}>
          {signingUp
            ? 'Create an account to host and join meetings'
            : 'Sign in to start or join a meeting'}
        </Text>

        <View style={styles.tabs}>
          {(['signIn', 'signUp'] as const).map((option) => (
            <Pressable
              key={option}
              style={[styles.tab, mode === option && styles.tabActive]}
              onPress={() => setMode(option)}
              accessibilityRole="button"
              accessibilityState={{ selected: mode === option }}
            >
              <Text style={[styles.tabText, mode === option && styles.tabTextActive]}>
                {option === 'signIn' ? 'Sign in' : 'Sign up'}
              </Text>
            </Pressable>
          ))}
        </View>

        {signingUp && (
          <TextInput
            style={styles.input}
            value={displayName}
            onChangeText={setDisplayName}
            placeholder="Your name (shown to other participants)"
            placeholderTextColor={colors.textSubtle}
            autoCapitalize="words"
          />
        )}
        <TextInput
          style={styles.input}
          value={email}
          onChangeText={setEmail}
          placeholder="you@example.com"
          placeholderTextColor={colors.textSubtle}
          autoCapitalize="none"
          autoComplete="email"
          autoCorrect={false}
          keyboardType="email-address"
        />
        <TextInput
          style={styles.input}
          value={password}
          onChangeText={setPassword}
          placeholder={signingUp ? `Password (${MIN_PASSWORD_LENGTH}+ characters)` : 'Password'}
          placeholderTextColor={colors.textSubtle}
          autoCapitalize="none"
          autoComplete={signingUp ? 'new-password' : 'current-password'}
          secureTextEntry
          onSubmitEditing={submit}
        />

        <Button
          label={pending ? 'One moment…' : signingUp ? 'Create account' : 'Sign in'}
          icon={signingUp ? 'person-add' : 'log-in'}
          onPress={submit}
          disabled={!ready}
        />

        {error && <Text style={styles.error}>{error}</Text>}
        <Text style={styles.hint}>
          Accounts live in this deployment&apos;s own database, alongside the meetings you schedule.
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  container: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
    gap: 12,
    maxWidth: 440,
    width: '100%',
    alignSelf: 'center',
  },
  brand: {
    color: colors.text,
    fontSize: 40,
    fontWeight: '800',
    textAlign: 'center',
  },
  subtitle: {
    color: colors.textMuted,
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 12,
  },
  tabs: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 12,
    padding: 4,
    marginBottom: 4,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 10,
    borderRadius: 9,
  },
  tabActive: {
    backgroundColor: colors.surfaceRaised,
  },
  tabText: {
    color: colors.textMuted,
    fontSize: 15,
    fontWeight: '600',
  },
  tabTextActive: {
    color: colors.text,
  },
  input: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 12,
    color: colors.text,
    fontSize: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  error: {
    color: colors.danger,
    textAlign: 'center',
  },
  hint: {
    color: colors.textSubtle,
    fontSize: 12,
    textAlign: 'center',
    marginTop: 8,
  },
});
