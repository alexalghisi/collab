const memory = new Map<string, string>();

/** In-memory fallback for mobile builds without a Firebase project; data lives for the session. */
export const storage = {
  read(key: string): string | null {
    return memory.get(key) ?? null;
  },
  write(key: string, value: string): void {
    memory.set(key, value);
  },
};
