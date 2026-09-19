import { describe, expect, it } from 'vitest';
import { INITIAL_PEER_STATE } from '../signaling/events';
import { joinRemotePeer, rememberRemoteStream, syncRoomPeers } from './participants';

const stream = { id: 'mic' } as MediaStream;

describe('rememberRemoteStream', () => {
  it('keeps a stream that arrives before the peer row exists', () => {
    const next = rememberRemoteStream([], 'peer-b', stream);

    expect(next).toEqual([
      { peerId: 'peer-b', displayName: '', state: INITIAL_PEER_STATE, stream },
    ]);
  });

  it('attaches the stream to a peer who is already listed', () => {
    const listed = [{ peerId: 'peer-b', displayName: 'Bea', state: INITIAL_PEER_STATE }];

    expect(rememberRemoteStream(listed, 'peer-b', stream)[0]?.stream).toBe(stream);
  });
});

describe('syncRoomPeers', () => {
  it('keeps a stream that arrived before room:joined listed the peer', () => {
    const early = rememberRemoteStream([], 'peer-b', stream);

    expect(syncRoomPeers(early, [])).toEqual(early);
    expect(
      syncRoomPeers(early, [
        {
          peerId: 'peer-b',
          displayName: 'Bea',
          joinedAt: 1,
          state: INITIAL_PEER_STATE,
        },
      ]),
    ).toEqual([{ peerId: 'peer-b', displayName: 'Bea', state: INITIAL_PEER_STATE, stream }]);
  });
});

describe('joinRemotePeer', () => {
  it('does not drop a stream that landed before peer:joined', () => {
    const early = rememberRemoteStream([], 'peer-b', stream);
    const next = joinRemotePeer(early, {
      peerId: 'peer-b',
      displayName: 'Bea',
      joinedAt: 1,
      state: INITIAL_PEER_STATE,
    });

    expect(next).toEqual([
      { peerId: 'peer-b', displayName: 'Bea', state: INITIAL_PEER_STATE, stream },
    ]);
  });
});
