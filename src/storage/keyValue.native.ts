const memory = new Map<string, string>();

/** In-memory fallback for mobile builds; data lives for as long as the app is running. */
export const storage = {
  read(key: string): string | null {
    return memory.get(key) ?? null;
  },
  write(key: string, value: string): void {
    memory.set(key, value);
  },
  remove(key: string): void {
    memory.delete(key);
  },
};
