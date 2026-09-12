import { Pressable, SafeAreaView, StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import type { SocialProvider } from '../auth/types';

interface LoginScreenProps {
  onSignIn: (provider: SocialProvider) => void;
  error: string | null;
}

export function LoginScreen({ onSignIn, error }: LoginScreenProps) {
  return (
    <SafeAreaView style={styles.screen}>
      <StatusBar style="light" />
      <View style={styles.container}>
        <Text style={styles.brand}>Collab</Text>
        <Text style={styles.subtitle}>Sign in to start or join a meeting</Text>

        <Pressable style={[styles.button, styles.google]} onPress={() => onSignIn('google')}>
          <Text style={[styles.buttonText, styles.googleText]}>Continue with Google</Text>
        </Pressable>

        <Pressable style={[styles.button, styles.facebook]} onPress={() => onSignIn('facebook')}>
          <Text style={[styles.buttonText, styles.facebookText]}>Continue with Facebook</Text>
        </Pressable>

        {error && <Text style={styles.error}>{error}</Text>}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#0b1120',
  },
  container: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
    gap: 14,
  },
  brand: {
    color: '#f9fafb',
    fontSize: 40,
    fontWeight: '800',
    textAlign: 'center',
  },
  subtitle: {
    color: '#9ca3af',
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 24,
  },
  button: {
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
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
    marginTop: 8,
  },
});
