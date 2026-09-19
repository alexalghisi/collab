import { useRef, useState } from 'react';
import { Pressable, SafeAreaView, StyleSheet, Text, TextInput, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import type { SocialProvider } from '../../auth/types';
import { colors } from '../../theme';

type Mode = 'sign-in' | 'create';

interface AuthScreenProps {
  onSignIn: (provider: SocialProvider) => void;
  onSignInWithEmail: (email: string, password: string) => Promise<void>;
  onCreateAccount: (input: {
    displayName: string;
    email: string;
    password: string;
  }) => Promise<void>;
  social: { google: boolean; facebook: boolean };
  error: string | null;
}

export function AuthScreen({
  onSignIn,
  onSignInWithEmail,
  onCreateAccount,
  social,
  error,
}: AuthScreenProps) {
  const [mode, setMode] = useState<Mode>('sign-in');
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const creating = mode === 'create';
  const canSubmit =
    email.trim().length > 0 &&
    password.length >= 8 &&
    (!creating || displayName.trim().length >= 2) &&
    !busy;

  const runExclusive = async (work: () => void | Promise<void>): Promise<void> => {
    if (inFlight.current) {
      return;
    }
    inFlight.current = true;
    setBusy(true);
    try {
      await work();
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };

  const submit = (): Promise<void> => {
    if (!canSubmit) {
      return Promise.resolve();
    }
    return runExclusive(() =>
      creating
        ? onCreateAccount({
            displayName: displayName.trim(),
            email: email.trim(),
            password,
          })
        : onSignInWithEmail(email.trim(), password),
    );
  };

  const startSocial = (provider: SocialProvider): void => {
    void runExclusive(() => onSignIn(provider));
  };

  return (
    <SafeAreaView style={styles.screen}>
      <StatusBar style="light" />
      <View style={styles.container}>
        <View>
          <Text style={styles.brand}>Collab</Text>
          <Text style={styles.subtitle}>
            {creating
              ? 'Create an account to start or join a meeting.'
              : 'Sign in to start or join a meeting.'}
          </Text>
        </View>

        <Pressable
          style={[styles.button, styles.google]}
          onPress={() => startSocial('google')}
          disabled={busy}
          accessibilityRole="button"
          accessibilityLabel="Continue with Google"
        >
          <Text style={[styles.buttonText, styles.googleText]}>Continue with Google</Text>
        </Pressable>

        <Text style={styles.divider}>or use email</Text>

        <View style={styles.tabs}>
          <Pressable
            style={[styles.tab, !creating && styles.tabActive]}
            onPress={() => setMode('sign-in')}
            accessibilityRole="button"
            accessibilityState={{ selected: !creating }}
          >
            <Text style={[styles.tabLabel, !creating && styles.tabLabelActive]}>Sign in</Text>
          </Pressable>
          <Pressable
            style={[styles.tab, creating && styles.tabActive]}
            onPress={() => setMode('create')}
            accessibilityRole="button"
            accessibilityState={{ selected: creating }}
          >
            <Text style={[styles.tabLabel, creating && styles.tabLabelActive]}>Create account</Text>
          </Pressable>
        </View>

        {creating && (
          <TextInput
            style={styles.input}
            value={displayName}
            onChangeText={setDisplayName}
            placeholder="Full name"
            placeholderTextColor={colors.textSubtle}
            autoCapitalize="words"
            autoComplete="name"
            editable={!busy}
          />
        )}
        <TextInput
          style={styles.input}
          value={email}
          onChangeText={setEmail}
          placeholder="Work email"
          placeholderTextColor={colors.textSubtle}
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          editable={!busy}
        />
        <TextInput
          style={styles.input}
          value={password}
          onChangeText={setPassword}
          placeholder={creating ? 'Password (8+ characters)' : 'Password'}
          placeholderTextColor={colors.textSubtle}
          autoCapitalize="none"
          autoComplete={creating ? 'password-new' : 'password'}
          secureTextEntry
          editable={!busy}
          onSubmitEditing={() => void submit()}
        />

        <Pressable
          style={[styles.button, styles.primary, !canSubmit && styles.disabled]}
          onPress={() => void submit()}
          disabled={!canSubmit}
          accessibilityRole="button"
          accessibilityLabel={creating ? 'Create account' : 'Sign in'}
        >
          <Text style={styles.primaryText}>
            {busy ? 'Please wait…' : creating ? 'Create account' : 'Sign in'}
          </Text>
        </Pressable>

        {social.facebook && (
          <Pressable
            style={[styles.button, styles.facebook]}
            onPress={() => startSocial('facebook')}
            disabled={busy}
            accessibilityRole="button"
            accessibilityLabel="Continue with Facebook"
          >
            <Text style={[styles.buttonText, styles.facebookText]}>Continue with Facebook</Text>
          </Pressable>
        )}

        {error && <Text style={styles.error}>{error}</Text>}

        <Text style={styles.switch}>
          {creating ? 'Already have an account? ' : 'Need an account? '}
          <Text
            style={styles.switchAction}
            onPress={() => setMode(creating ? 'sign-in' : 'create')}
          >
            {creating ? 'Sign in' : 'Create one'}
          </Text>
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
    marginTop: 8,
    marginBottom: 12,
    lineHeight: 22,
  },
  tabs: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 4,
    marginBottom: 4,
  },
  tab: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
  },
  tabActive: {
    backgroundColor: colors.surfaceRaised,
  },
  tabLabel: {
    color: colors.textMuted,
    fontWeight: '700',
  },
  tabLabelActive: {
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
  button: {
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
  },
  primary: {
    backgroundColor: colors.primary,
    marginTop: 4,
  },
  primaryText: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '700',
  },
  disabled: {
    opacity: 0.5,
  },
  divider: {
    color: colors.textSubtle,
    textAlign: 'center',
    marginVertical: 4,
  },
  buttonText: {
    fontSize: 16,
    fontWeight: '700',
  },
  google: {
    backgroundColor: '#ffffff',
  },
  googleText: {
    color: '#1f2937',
  },
  facebook: {
    backgroundColor: '#1877f2',
  },
  facebookText: {
    color: '#ffffff',
  },
  error: {
    color: '#f87171',
    textAlign: 'center',
    marginTop: 4,
  },
  switch: {
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: 8,
  },
  switchAction: {
    color: colors.text,
    fontWeight: '700',
  },
});
