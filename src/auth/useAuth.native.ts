import type { AuthState } from './types';

const noop = async (): Promise<void> => {};

/**
 * Native builds use the open guest lobby; social sign-in is web-only for now.
 */
export function useAuth(): AuthState {
  return {
    enabled: false,
    initializing: false,
    user: null,
    error: null,
    signIn: noop,
    signOut: noop,
  };
}
