import { registerRootComponent } from 'expo';
import App from './App';
import { completeOAuthRedirect } from './src/auth/googleOAuthPopup';
import { setupWebRtcGlobals } from './src/webrtc/globals';

// When this window is the Google sign-in popup returning to the app, hand the
// token to the tab that opened it and close; don't boot the whole app.
if (!completeOAuthRedirect()) {
  setupWebRtcGlobals();
  registerRootComponent(App);
}
