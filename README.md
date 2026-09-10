# Collab

![App Demo](./assets/demo.png)

> Cross-platform video conferencing built with React Native, Expo, WebRTC, and a Node.js signaling server. One codebase ships to **macOS, Windows, iOS, and Android**.

<p>
  <a href="https://github.com/alexalghisi/collab/actions/workflows/ci.yml"><img alt="CI" src="https://github.com/alexalghisi/collab/actions/workflows/ci.yml/badge.svg" /></a>
  <a href="https://github.com/alexalghisi/collab/actions/workflows/release.yml"><img alt="Release" src="https://github.com/alexalghisi/collab/actions/workflows/release.yml/badge.svg" /></a>
  <a href="./LICENSE"><img alt="License: MIT" src="https://img.shields.io/badge/license-MIT-blue.svg" /></a>
</p>

---

## Table of contents

- [Download & run (for recruiters)](#download--run-for-recruiters)
- [Features](#features)
- [Architecture](#architecture)
- [Call setup flow](#call-setup-flow)
- [Project structure](#project-structure)
- [Local development](#local-development)
- [Building release binaries](#building-release-binaries)
- [iOS distribution (EAS / TestFlight)](#ios-distribution-eas--testflight)
- [Quality gates](#quality-gates)

---

## Download & run (for recruiters)

Prebuilt binaries are published automatically for every tagged release.

1. Open the **[Releases](https://github.com/alexalghisi/collab/releases)** tab of this repository.
2. Expand **Assets** on the latest release and download the file for your platform:

| Platform              | Asset                        | How to run                                                                                 |
| --------------------- | ---------------------------- | ------------------------------------------------------------------------------------------ |
| Android               | `app-release.apk`            | Copy to an Android device and open it. Allow "install from unknown sources" when prompted. |
| iOS                   | `Collab-unsigned.ipa`        | Unsigned build — install by sideloading (AltStore / Sideloadly) or use TestFlight (below). |
| Windows               | `Collab.Setup.<version>.exe` | Run the installer and launch **Collab** from the Start menu.                               |
| macOS (Apple Silicon) | `Collab-<version>-arm64.dmg` | Open the `.dmg`, drag **Collab** into Applications, then launch it.                        |
| macOS (Intel)         | `Collab-<version>-x64.dmg`   | Open the `.dmg`, drag **Collab** into Applications, then launch it.                        |
| Linux (AppImage)      | `Collab-<version>.AppImage`  | `chmod +x` the file, then run it. Works on most distributions.                             |
| Linux (Debian/Ubuntu) | `Collab-<version>.deb`       | Install with `sudo dpkg -i Collab-<version>.deb`, then launch **Collab**.                  |

> The macOS and Windows builds are unsigned in this scaffold. On macOS, right-click the app and choose **Open** the first time to bypass Gatekeeper. On Windows, choose **More info -> Run anyway** on the SmartScreen prompt.

iOS ships as an **unsigned** `.ipa`. Apple does not allow installing a downloaded `.ipa` directly, so it must be sideloaded (AltStore / Sideloadly) or, for the signed route, installed via TestFlight — see [iOS distribution](#ios-distribution-eas--testflight).

---

## Features

- Multi-party calls over a mesh of WebRTC peer connections.
- Real-time signaling over Socket.IO with strongly typed events shared between client and server.
- Single TypeScript codebase for mobile (iOS/Android), web, and desktop (macOS/Windows via Electron).
- Automated multi-platform release pipeline that publishes installable binaries to GitHub Releases.
- Strict CI quality gates: Prettier, ESLint, and TypeScript.

---

## Architecture

Collab uses a **mesh topology**: each participant holds a direct `RTCPeerConnection` with every other participant. The signaling server never touches media — it only relays SDP and ICE metadata to bootstrap the peer connections.

```mermaid
flowchart LR
  subgraph Clients
    A["Mobile app<br/>(Expo / React Native)"]
    B["Desktop app<br/>(Electron + web build)"]
    C["Web app<br/>(Expo Web)"]
  end

  S["Signaling server<br/>(Node.js · Express · Socket.IO)"]

  A -- "SDP / ICE (Socket.IO)" --> S
  B -- "SDP / ICE (Socket.IO)" --> S
  C -- "SDP / ICE (Socket.IO)" --> S

  A <== "Media (SRTP / WebRTC)" ==> B
  B <== "Media (SRTP / WebRTC)" ==> C
  A <== "Media (SRTP / WebRTC)" ==> C
```

The reusable core is deliberately platform-agnostic. It is written against the standard W3C WebRTC API; on native platforms `react-native-webrtc` registers the same globals via `registerGlobals()`, so the exact same negotiation logic runs everywhere.

```mermaid
flowchart TD
  UI["App.tsx / VideoTile"] --> Hook["useCollabSession"]
  Hook --> Manager["PeerConnectionManager"]
  Hook --> Client["SignalingClient (socket.io-client)"]
  Manager --> RTC["RTCPeerConnection (W3C API)"]
  Manager --> Client
  Client --> Server["Signaling server"]
```

---

## Call setup flow

```mermaid
sequenceDiagram
  participant N as Newcomer
  participant S as Signaling server
  participant P as Existing peer

  N->>S: room:join { roomId, displayName }
  S-->>N: room:peers [existing peers]
  S-->>P: peer:joined { peerId, displayName }
  N->>N: createOffer + setLocalDescription
  N->>S: signal:offer { targetPeerId }
  S-->>P: signal:offer { fromPeerId }
  P->>P: setRemoteDescription + createAnswer
  P->>S: signal:answer { targetPeerId }
  S-->>N: signal:answer { fromPeerId }
  N-)S: signal:ice (trickle)
  S-)P: signal:ice
  P-)S: signal:ice (trickle)
  S-)N: signal:ice
  N<<->>P: Encrypted media (SRTP)
```

---

## Project structure

```
Collab/
├── App.tsx                     # Root React Native component (lobby + call screen)
├── index.ts                    # Expo entry point; registers WebRTC globals
├── app.json                    # Expo configuration
├── src/
│   ├── components/             # VideoTile (base + .native variant with RTCView)
│   ├── hooks/                  # useCollabSession orchestration hook
│   ├── signaling/             # Shared event contract + Socket.IO client
│   └── webrtc/                 # RTC configuration, PeerConnectionManager, media helpers
├── server/
│   └── src/                    # Express + Socket.IO signaling server
├── desktop/                    # Electron shell + electron-builder config (.dmg / .exe)
├── scripts/                    # Build helpers
└── .github/                    # CI, release workflow, issue & PR templates
```

---

## Local development

### Prerequisites

- Node.js 20+
- For native builds: Android Studio (Android) and Xcode (iOS)

### 1. Install dependencies

```bash
npm install
```

### 2. Start the signaling server

```bash
npm run server
```

The server listens on `http://localhost:4000` and exposes `GET /health`.

### 3. Start the app

```bash
npm start        # Expo dev server (choose a target)
npm run web      # Web
npm run android  # Android device / emulator
npm run ios      # iOS simulator
```

By default the app connects to `http://localhost:4000`. Override it with the
`EXPO_PUBLIC_SIGNALING_URL` environment variable.

### 4. Run the desktop shell locally

```bash
npm run export:web      # produce the static web build in dist-web/
npm run desktop:web     # stage it into desktop/web/
cd desktop && npm install && npm start
```

---

## Building release binaries

Releases are fully automated. Pushing a version tag triggers `.github/workflows/release.yml`, which builds every platform in parallel and uploads the assets to a GitHub Release.

```bash
git tag v1.0.0
git push origin v1.0.0
```

| Job     | Runner           | Output                                       |
| ------- | ---------------- | -------------------------------------------- |
| Android | `ubuntu-latest`  | `.apk` via `expo prebuild` + Gradle          |
| Windows | `windows-latest` | `.exe` installer via Electron Builder (NSIS) |
| macOS   | `macos-latest`   | `.dmg` (arm64 + x64) via Electron Builder    |
| Linux   | `ubuntu-latest`  | `.AppImage` and `.deb` via Electron Builder  |

> The Android job signs the release APK with the debug keystore for a zero-config demo. For production, add a release keystore and configure `android/app/build.gradle` signing plus repository secrets.

---

## iOS distribution (EAS / TestFlight)

The Releases tab includes an **unsigned** `Collab-unsigned.ipa` built by CI. Because Apple requires every iOS app to be signed, that file cannot be installed by simply downloading it — install it by sideloading with [AltStore](https://altstore.io) or [Sideloadly](https://sideloadly.io), which re-sign it with your own Apple ID on device.

For a signed, shareable build (recommended for reviewers), distribute through Expo Application Services (EAS) and TestFlight:

```bash
npm install -g eas-cli
eas login
eas build:configure

# Build a signed iOS binary in the cloud
eas build --platform ios --profile production

# Submit the build to App Store Connect / TestFlight
eas submit --platform ios --latest
```

Once processed, invite reviewers as TestFlight testers to install the app on their devices. See the [EAS Build docs](https://docs.expo.dev/build/introduction/) for signing and provisioning details.

---

## Quality gates

Every push and pull request runs `.github/workflows/ci.yml`:

```bash
npm run format      # Prettier (check)
npm run lint        # ESLint
npm run type-check  # TypeScript (strict, no emit)
```

Run `npm run format:fix` and `npm run lint:fix` locally to apply automatic fixes.

---

## License

[MIT](./LICENSE) © Alex Alghisi
