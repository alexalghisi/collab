import { registerRootComponent } from 'expo';
import App from './App';
import { setupWebRtcGlobals } from './src/webrtc/globals';

setupWebRtcGlobals();

registerRootComponent(App);
