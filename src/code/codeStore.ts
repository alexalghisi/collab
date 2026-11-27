import { storage } from '../meeting/storage';

export interface CodeStore {
  load(): string | null;
  save(state: string): void;
}

const codeKey = (roomId: string) => `collab.code.${roomId}`;

export function roomCodeStore(roomId: string): CodeStore {
  return {
    load: () => storage.read(codeKey(roomId)),
    save: (state) => storage.write(codeKey(roomId), state),
  };
}
