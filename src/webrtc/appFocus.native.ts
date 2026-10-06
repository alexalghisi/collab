import { AppState, type AppStateStatus } from 'react-native';

/**
 * Fires when the app returns to the foreground. `inactive` is the half-way
 * state a phone passes through while the app switcher or a notification shade
 * is open, and nothing was taken away yet, so only a real trip to the
 * background counts as having left.
 */
export function onAppResumed(listener: () => void): () => void {
  let away = AppState.currentState === 'background';
  const subscription = AppState.addEventListener('change', (next: AppStateStatus) => {
    if (next === 'background') {
      away = true;
      return;
    }
    if (next === 'active' && away) {
      away = false;
      listener();
    }
  });
  return () => subscription.remove();
}
