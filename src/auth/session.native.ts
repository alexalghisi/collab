let memory: string | null = null;

export function readSessionToken(): string | null {
  return memory;
}

export function writeSessionToken(token: string): void {
  memory = token;
}

export function clearSessionToken(): void {
  memory = null;
}
