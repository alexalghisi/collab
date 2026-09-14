import { useState } from 'react';
import { Pressable, SafeAreaView, StyleSheet, Text, TextInput, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import type { Credentials, SignUpRequest } from '../auth/accounts';
import { looksLikeEmail, MIN_PASSWORD_LENGTH } from '../auth/credentials';
import { colors } from '../theme';
import { Button } from './ui/Button';

type Mode = 'signIn' | 'signUp';

export interface LoginScreenProps {
  onSignIn: (credentials: Credentials) => void;
  onSignUp: (request: SignUpRequest) => void;
  error: string | null;
  pending: boolean;
}

/**
 * The way into the app. Signing up asks for a name because that name is what
 * the room shows and what the calendar invites — there is no guest lobby.
 */
export function LoginScreen({ onSignIn, onSignUp, error, pending }: LoginScreenProps) {
  const [mode, setMode] = useState<Mode>('signIn');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const signingUp = mode === 'signUp';
  const ready =
    looksLikeEmail(email) &&
    password.length >= MIN_PASSWORD_LENGTH &&
    (!signingUp || name.trim().length > 0);

  const submit = () => {
    if (!ready || pending) {
      return;
    }
    if (signingUp) {
      onSignUp({ name: name.trim(), email: email.trim(), password });
    } else {
      onSignIn({ email: email.trim(), password });
    }
  };

  return (
    <SafeAreaView style={styles.screen}>
      <StatusBar style="light" />
      <View style={styles.container}>
        <Text style={styles.brand}>Collab</Text>
        <Text style={styles.subtitle}>
          {signingUp
            ? 'Create an account to start and schedule meetings'
            : 'Sign in to start or join a meeting'}
        </Text>

        {signingUp && (
          <TextInput
            style={styles.input}
            value={name}
            onChangeText={setName}
            placeholder="Your name (shown to other participants)"
            placeholderTextColor={colors.textSubtle}
            autoCapitalize="words"
          />
        )}
        <TextInput
          style={styles.input}
          value={email}
          onChangeText={setEmail}
          placeholder="Email address"
          placeholderTextColor={colors.textSubtle}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
          textContentType="emailAddress"
        />
        <TextInput
          style={styles.input}
          value={password}
          onChangeText={setPassword}
          placeholder={`Password (at least ${MIN_PASSWORD_LENGTH} characters)`}
          placeholderTextColor={colors.textSubtle}
          autoCapitalize="none"
          autoCorrect={false}
          secureTextEntry
          onSubmitEditing={submit}
        />

        <Button
          label={signingUp ? 'Create account' : 'Sign in'}
          icon={signingUp ? 'person-add' : 'log-in'}
          onPress={submit}
          disabled={!ready || pending}
        />

        <Pressable
          style={styles.switch}
          onPress={() => setMode(signingUp ? 'signIn' : 'signUp')}
          accessibilityRole="button"
        >
          <Text style={styles.switchText}>
            {signingUp ? 'I already have an account' : 'Create an account'}
          </Text>
        </Pressable>

        {error && <Text style={styles.error}>{error}</Text>}
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
    maxWidth: 420,
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
    marginBottom: 20,
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
  switch: {
    alignItems: 'center',
    paddingVertical: 8,
  },
  switchText: {
    color: colors.primary,
    fontWeight: '600',
  },
  error: {
    color: colors.danger,
    textAlign: 'center',
  },
});
