import type { SignalingChannel, SignalingFactory, SignalingOptions } from './SignalingChannel';

export class FallbackChannel implements SignalingChannel {
  private active: SignalingChannel;

  constructor(
    private readonly primary: SignalingChannel,
    private readonly secondary: SignalingChannel,
  ) {
    this.active = primary;
  }

  on: SignalingChannel['on'] = (event, handler) => {
    this.primary.on(event, handler);
    this.secondary.on(event, handler);
  };

  emit: SignalingChannel['emit'] = (event, payload) => {
    this.active.emit(event, payload);
  };

  async connect(): Promise<void> {
    try {
      await this.primary.connect();
      this.active = this.primary;
    } catch {
      this.primary.disconnect();
      await this.secondary.connect();
      this.active = this.secondary;
    }
  }

  disconnect(): void {
    this.primary.disconnect();
    this.secondary.disconnect();
  }

  upload: SignalingChannel['upload'] = (file, onProgress) => this.active.upload(file, onProgress);

  sendInvite: SignalingChannel['sendInvite'] = (input, hostName, link, inviteRoomId) =>
    this.active.sendInvite(input, hostName, link, inviteRoomId);
}

export function withSocketFallback(
  primary: SignalingFactory,
  secondary: SignalingFactory,
): SignalingFactory {
  return (options: SignalingOptions) => new FallbackChannel(primary(options), secondary(options));
}
