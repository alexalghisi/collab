/** Persists small values in the browser: the session token and offline meetings. */
export const storage = {
  read(key: string): string | null {
    return window.localStorage.getItem(key);
  },
  write(key: string, value: string): void {
    window.localStorage.setItem(key, value);
  },
  remove(key: string): void {
    window.localStorage.removeItem(key);
  },
};
