#!/usr/bin/env bash
# Renames build artifacts to consistent names, writes SHA256SUMS.txt and
# renders the release body (release-notes.md) used by the Release workflow.
# Usage: prepare-release.sh <artifacts-dir> <out-dir> <tag> <owner/repo>
set -euo pipefail

SRC="$1"
OUT="$2"
TAG="$3"
REPO="$4"
VER="${TAG#v}"
DL="https://github.com/${REPO}/releases/download/${TAG}"
PAGES="https://${REPO%%/*}.github.io/${REPO##*/}"

mkdir -p "$OUT"

pick() { # first file in $1 matching glob $2
  find "$1" -type f -name "$2" 2>/dev/null | sort | head -1
}

stage() { # <source-file> <target-name>
  if [ -n "$1" ] && [ -f "$1" ]; then
    cp "$1" "$OUT/$2"
  else
    echo "::warning::missing artifact for $2"
  fi
}

APK="Collab-${VER}-android.apk"
IPA="Collab-${VER}-ios-unsigned.ipa"
EXE="Collab-${VER}-windows-setup.exe"
DMG_ARM="Collab-${VER}-macos-apple-silicon.dmg"
DMG_X64="Collab-${VER}-macos-intel.dmg"
APPIMAGE="Collab-${VER}-linux-x86_64.AppImage"
DEB="Collab-${VER}-linux-amd64.deb"

stage "$(pick "$SRC/collab-android" '*.apk')"        "$APK"
stage "$(pick "$SRC/collab-ios" '*.ipa')"            "$IPA"
stage "$(pick "$SRC/collab-windows" '*.exe')"        "$EXE"
stage "$(pick "$SRC/collab-macos" '*arm64*.dmg')"    "$DMG_ARM"
stage "$(pick "$SRC/collab-macos" '*x64*.dmg')"      "$DMG_X64"
stage "$(pick "$SRC/collab-linux" '*.AppImage')"     "$APPIMAGE"
stage "$(pick "$SRC/collab-linux" '*.deb')"          "$DEB"

(cd "$OUT" && sha256sum Collab-* > SHA256SUMS.txt)

size() { # human size of a staged file, or "—"
  if [ -f "$OUT/$1" ]; then
    numfmt --to=si --suffix=B --format='%.0f' "$(stat -c %s "$OUT/$1")"
  else
    echo "—"
  fi
}

row() { # <platform> <variant> <file>
  if [ -f "$OUT/$3" ]; then
    echo "| $1 | $2 | [**Download**](${DL}/$3) | $(size "$3") |"
  fi
}

{
  cat <<EOF
<p align="center">
  <img src="https://raw.githubusercontent.com/${REPO}/${TAG}/assets/icon.png" width="96" alt="Collab" />
</p>

<h1 align="center">Collab ${VER}</h1>

<p align="center">
  Video calls, a shared code editor and practice problems — on every device.<br/>
  <a href="${PAGES}"><b>Open in the browser</b></a> &nbsp;·&nbsp;
  <a href="#install">Install guide</a> &nbsp;·&nbsp;
  <a href="${DL}/SHA256SUMS.txt">Checksums</a>
</p>

---

## ⬇️ Download

| Platform | Build | Link | Size |
|:--|:--|:--|--:|
EOF
  row "🍎 macOS" "Apple Silicon (M1–M4)" "$DMG_ARM"
  row "🍎 macOS" "Intel" "$DMG_X64"
  row "🪟 Windows" "10 / 11 · 64-bit installer" "$EXE"
  row "🐧 Linux" "AppImage · any distro" "$APPIMAGE"
  row "🐧 Linux" "Debian / Ubuntu (.deb)" "$DEB"
  row "🤖 Android" "8.0+ · APK" "$APK"
  row "📱 iOS" "Unsigned IPA · sideload only" "$IPA"

  cat <<'EOF'

> **Not sure which one?** On a Mac, open  → *About This Mac*: "Apple M…" means Apple Silicon, "Intel" means Intel.

<a id="install"></a>
## 🛠 Install

<details>
<summary><b>macOS</b></summary>

1. Open the `.dmg` and drag **Collab** into **Applications**.
2. The first time, right-click Collab → **Open** → **Open** (the build isn't notarized yet).
</details>

<details>
<summary><b>Windows</b></summary>

1. Run the installer.
2. If SmartScreen appears, click **More info** → **Run anyway**.
</details>

<details>
<summary><b>Linux</b></summary>

```bash
# AppImage
chmod +x Collab-*.AppImage && ./Collab-*.AppImage

# Debian / Ubuntu
sudo apt install ./Collab-*-linux-amd64.deb
```
</details>

<details>
<summary><b>Android</b></summary>

Download the APK on your phone, open it, and allow **Install unknown apps** for your browser when asked.
</details>

<details>
<summary><b>iOS</b></summary>

The IPA is unsigned. Install it with AltStore, Sideloadly or your own signing certificate.
</details>

## 🔐 Verify your download

```bash
sha256sum -c SHA256SUMS.txt --ignore-missing
```

<details>
<summary>SHA-256 checksums</summary>

```
EOF
  cat "$OUT/SHA256SUMS.txt"
  cat <<'EOF'
```
</details>

---

EOF
} > "$OUT/release-notes.md"

echo "Staged assets:"
ls -la "$OUT"
