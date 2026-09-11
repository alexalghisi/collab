/** Persists small JSON blobs in the browser when no Firebase project is configured. */
export const storage = {
  read(key: string): string | null {
    return window.localStorage.getItem(key);
  },
  write(key: string, value: string): void {
    window.localStorage.setItem(key, value);
  },
};
