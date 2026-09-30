export function shouldUseFirestoreSignaling(store: unknown, signedIn: boolean): boolean {
  return Boolean(store) && signedIn;
}
