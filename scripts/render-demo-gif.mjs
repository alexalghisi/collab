import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outFile = join(root, 'assets', 'demo.gif');
const chrome =
  process.env.CHROME_PATH ||
  ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/local/bin/google-chrome'].find(
    (bin) => {
      const probe = spawnSync(bin, ['--version'], { encoding: 'utf8' });
      return probe.status === 0;
    },
  );
const ffmpeg = 'ffmpeg';

if (!chrome) {
  throw new Error('google-chrome is required to render assets/demo.gif');
}

const palette = {
  background: '#0b1120',
  surface: '#111827',
  raised: '#1f2937',
  text: '#f9fafb',
  muted: '#9ca3af',
  subtle: '#6b7280',
  primary: '#2563eb',
  warning: '#f59e0b',
  danger: '#dc2626',
};

const chromeUi = `
  <div class="chrome">
    <div class="dots"><span></span><span></span><span></span></div>
    <div class="omnibox">localhost:8081</div>
  </div>
`;

const sidebar = `
  <aside>
    <div class="brand">Collab</div>
    <nav>
      <div class="nav active">Home</div>
      <div class="nav">Meetings</div>
      <div class="nav">Calendar</div>
      <div class="nav">Chat</div>
      <div class="nav">Search</div>
    </nav>
    <div class="account">
      <div class="avatar">A</div>
      <div>
        <div class="name">Alex</div>
        <div class="hint">Sign out</div>
      </div>
    </div>
  </aside>
`;

const css = `
  html, body { margin: 0; background: #0f172a; font-family: ui-sans-serif, system-ui, sans-serif; }
  .window { width: 960px; height: 600px; background: ${palette.background}; color: ${palette.text}; overflow: hidden; }
  .chrome { display: flex; align-items: center; gap: 10px; height: 38px; padding: 0 12px; background: #1e293b; }
  .dots { display: flex; gap: 6px; }
  .dots span { width: 10px; height: 10px; border-radius: 50%; background: #475569; display: block; }
  .omnibox { flex: 1; background: #0f172a; color: ${palette.muted}; border-radius: 8px; padding: 6px 12px; font-size: 12px; }
  .app { display: flex; height: 562px; }
  aside { width: 200px; background: ${palette.surface}; padding: 22px 14px; display: flex; flex-direction: column; gap: 18px; }
  .brand { font-size: 24px; font-weight: 800; padding: 0 8px; }
  nav { flex: 1; display: flex; flex-direction: column; gap: 4px; }
  .nav { color: ${palette.muted}; padding: 10px 12px; border-radius: 10px; font-weight: 600; font-size: 14px; }
  .nav.active { background: ${palette.raised}; color: ${palette.text}; }
  .account { display: flex; gap: 10px; align-items: center; padding: 0 8px; }
  .avatar { width: 34px; height: 34px; border-radius: 17px; background: ${palette.primary}; display: grid; place-items: center; font-weight: 700; }
  .name { font-weight: 600; font-size: 14px; }
  .hint { color: ${palette.subtle}; font-size: 12px; }
  main { flex: 1; padding: 24px; }
  h1 { margin: 0; font-size: 28px; font-weight: 800; }
  .date { color: ${palette.muted}; margin: 6px 0 18px; font-size: 14px; }
  .cards { display: flex; gap: 14px; }
  .card { flex: 1; background: ${palette.surface}; border: 1px solid ${palette.raised}; border-radius: 16px; padding: 16px; }
  .icon { width: 44px; height: 44px; border-radius: 12px; display: grid; place-items: center; font-weight: 700; margin-bottom: 8px; }
  .card h2 { margin: 0; font-size: 16px; }
  .card p { margin: 6px 0 0; color: ${palette.muted}; font-size: 12px; }
  .join { margin-top: 16px; background: ${palette.surface}; border: 1px solid ${palette.raised}; border-radius: 16px; padding: 16px; }
  .field { background: ${palette.background}; color: ${palette.subtle}; border-radius: 12px; padding: 12px 14px; margin: 10px 0; font-size: 14px; }
  .btn { display: inline-block; background: ${palette.primary}; color: ${palette.text}; border-radius: 10px; padding: 8px 14px; font-weight: 700; font-size: 14px; }
  .meeting { padding: 16px 18px 0; display: flex; flex-direction: column; height: 562px; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; }
  .room { font-weight: 700; font-size: 18px; }
  .meta { color: ${palette.muted}; font-size: 13px; margin-top: 4px; }
  .invite { background: ${palette.primary}; border-radius: 10px; padding: 8px 12px; font-size: 13px; font-weight: 700; }
  .body { display: flex; gap: 14px; flex: 1; margin-top: 14px; min-height: 0; }
  .grid { flex: 1; display: flex; gap: 12px; }
  .tile { flex: 1; background: ${palette.surface}; border-radius: 14px; display: grid; place-items: center; position: relative; }
  .letter { font-size: 42px; font-weight: 700; color: ${palette.muted}; }
  .label { position: absolute; left: 12px; bottom: 12px; font-size: 13px; font-weight: 600; }
  .host { color: ${palette.subtle}; font-size: 11px; margin-left: 6px; }
  .panel { width: 280px; background: ${palette.surface}; border-radius: 14px; padding: 16px; }
  .panel h3 { margin: 0 0 10px; }
  .panel p, .panel .link { color: ${palette.muted}; font-size: 13px; line-height: 1.4; }
  .copy { background: ${palette.raised}; border-radius: 10px; padding: 10px; text-align: center; margin-top: 12px; font-size: 13px; }
  .toolbar { display: flex; justify-content: center; gap: 10px; padding: 14px 0 16px; }
  .tool { width: 42px; height: 42px; border-radius: 21px; background: ${palette.raised}; }
  .tool.red { background: ${palette.danger}; }
  .tool.blue { background: ${palette.primary}; }
  .bubble { border-radius: 12px; padding: 8px 10px; margin: 8px 0; font-size: 13px; max-width: 90%; }
  .me { background: ${palette.primary}; margin-left: auto; }
  .them { background: ${palette.raised}; }
`;

function page(title, body) {
  return `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title>
  <style>${css}</style></head><body><div class="window">${chromeUi}${body}</div></body></html>`;
}

const home = page(
  'home',
  `<div class="app">${sidebar}<main>
    <h1>Good afternoon, Alex</h1>
    <div class="date">Monday, September 21, 2026 · 3:15 PM</div>
    <div class="cards">
      <div class="card"><div class="icon" style="background:${palette.warning}">▶</div><h2>New meeting</h2><p>Start now and invite others</p></div>
      <div class="card"><div class="icon" style="background:${palette.primary}">▣</div><h2>Schedule</h2><p>Plan ahead, add to your calendar</p></div>
    </div>
    <div class="join">
      <h2>Join a meeting</h2>
      <div class="field">Meeting ID from an invite</div>
      <div class="btn">Join</div>
    </div>
  </main></div>`,
);

const meeting = page(
  'meeting',
  `<div class="meeting">
    <div class="header">
      <div><div class="room">nbq-vxey-nfg</div><div class="meta">Only you so far — send the invite on the right</div></div>
      <div class="invite">Invite</div>
    </div>
    <div class="body">
      <div class="grid"><div class="tile"><div class="letter">A</div><div class="label">Alex (You)<span class="host">Host</span></div></div></div>
      <div class="panel">
        <h3>Invite</h3>
        <p>Send the join link by email or SMS. The other person gets a message they can open to join this call.</p>
        <div class="field">name@email.com</div>
        <div class="btn">Send invite</div>
        <div class="copy">Copy link</div>
      </div>
    </div>
    <div class="toolbar"><div class="tool"></div><div class="tool"></div><div class="tool"></div><div class="tool"></div><div class="tool"></div><div class="tool blue"></div><div class="tool red"></div></div>
  </div>`,
);

const together = page(
  'together',
  `<div class="meeting">
    <div class="header">
      <div><div class="room">nbq-vxey-nfg</div><div class="meta">2 participants</div></div>
      <div class="invite">Invite</div>
    </div>
    <div class="body">
      <div class="grid">
        <div class="tile"><div class="letter">A</div><div class="label">Alex (You)<span class="host">Host</span></div></div>
        <div class="tile"><div class="letter">S</div><div class="label">Sam</div></div>
      </div>
      <div class="panel">
        <h3>Chat</h3>
        <div class="bubble me">Camera is off on this laptop — audio is up.</div>
        <div class="bubble them">Loud and clear here too.</div>
      </div>
    </div>
    <div class="toolbar"><div class="tool"></div><div class="tool"></div><div class="tool"></div><div class="tool"></div><div class="tool"></div><div class="tool blue"></div><div class="tool red"></div></div>
  </div>`,
);

const dir = mkdtempSync(join(tmpdir(), 'collab-demo-'));
const frames = [
  ['home.html', home, '01.png'],
  ['meeting.html', meeting, '02.png'],
  ['together.html', together, '03.png'],
];

for (const [name, html, png] of frames) {
  const htmlPath = join(dir, name);
  writeFileSync(htmlPath, html);
  const shot = spawnSync(
    chrome,
    [
      '--headless=new',
      '--disable-gpu',
      '--no-sandbox',
      '--hide-scrollbars',
      '--force-device-scale-factor=1',
      '--window-size=960,600',
      `--screenshot=${join(dir, png)}`,
      `file://${htmlPath}`,
    ],
    { encoding: 'utf8' },
  );
  if (shot.status !== 0) {
    throw new Error(shot.stderr || shot.stdout || `chrome failed on ${name}`);
  }
}

const paletteFile = join(dir, 'palette.png');
const concat = spawnSync(
  ffmpeg,
  [
    '-y',
    '-framerate',
    '1',
    '-i',
    join(dir, '%02d.png'),
    '-vf',
    'scale=800:-1:flags=lanczos,palettegen=max_colors=64',
    paletteFile,
  ],
  { encoding: 'utf8' },
);
if (concat.status !== 0) {
  throw new Error(concat.stderr || 'ffmpeg palettegen failed');
}

mkdirSync(join(root, 'assets'), { recursive: true });
const gif = spawnSync(
  ffmpeg,
  [
    '-y',
    '-framerate',
    '1',
    '-i',
    join(dir, '%02d.png'),
    '-i',
    paletteFile,
    '-lavfi',
    'scale=800:-1:flags=lanczos[x];[x][1:v]paletteuse=dither=bayer',
    '-loop',
    '0',
    outFile,
  ],
  { encoding: 'utf8' },
);
if (gif.status !== 0) {
  throw new Error(gif.stderr || 'ffmpeg gif encode failed');
}

const bytes = readFileSync(outFile).byteLength;
process.stdout.write(`Wrote ${outFile} (${bytes} bytes)\n`);
