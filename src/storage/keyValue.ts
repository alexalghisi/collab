/** Persists small JSON blobs in the browser: the signed-in session, and meetings when there is no backend. */
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
