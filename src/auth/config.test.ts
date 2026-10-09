import { describe, expect, it } from 'vitest';
import { nativeGoogleClientId, type NativeAuthConfig } from './config';

const WEB = 'web.apps.googleusercontent.com';
const IOS = 'ios.apps.googleusercontent.com';
const ANDROID = 'android.apps.googleusercontent.com';

function configured(google: NativeAuthConfig['google']): NativeAuthConfig {
  return { google, facebookAppId: null };
}

describe('nativeGoogleClientId', () => {
  it('hands each platform the client Google issued for it', () => {
    const config = configured({ webClientId: WEB, iosClientId: IOS, androidClientId: ANDROID });

    expect(nativeGoogleClientId(config, 'ios')).toBe(IOS);
    expect(nativeGoogleClientId(config, 'android')).toBe(ANDROID);
    expect(nativeGoogleClientId(config, 'web')).toBe(WEB);
  });

  it('reports no client on a phone rather than borrowing the web one', () => {
    const config = configured({ webClientId: WEB });

    expect(nativeGoogleClientId(config, 'ios')).toBeNull();
    expect(nativeGoogleClientId(config, 'android')).toBeNull();
  });

  it('reports no client when Google is not configured at all', () => {
    expect(nativeGoogleClientId(null, 'ios')).toBeNull();
    expect(nativeGoogleClientId(configured(null), 'web')).toBeNull();
  });
});
