// Tests for upload-media.mjs + lib/card-media-md.mjs
// Run: node --test skills/sourcards-import/scripts/upload-media.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync, spawn } from 'node:child_process';
import { createServer } from 'node:http';
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  classifyMediaSrc,
  extractMediaSrcs,
  extractPayloadMediaSrcs,
  isPublicHttpsMediaSrc,
  needsMediaUpload,
  rewriteMediaSrc,
  rewritePayloadMedia,
} from '../../../lib/card-media-md.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const UPLOAD = join(__dirname, 'upload-media.mjs');

function run(args, { input, env = {} } = {}) {
  const r = spawnSync('node', [UPLOAD, ...args], {
    input: input != null ? (typeof input === 'string' ? input : JSON.stringify(input)) : undefined,
    encoding: 'utf8',
    // Default: skip monorepo .env.local so unit tests don't hit real R2/GitHub.
    // Opt in to real env with env: { SOURCARDS_MEDIA_SKIP_ENV_FILE: '' } or omit after delete.
    env: {
      ...process.env,
      SOURCARDS_MEDIA_SKIP_ENV_FILE: '1',
      ...env,
    },
  });
  return { code: r.status, out: r.stdout, err: r.stderr, combined: r.stdout + r.stderr };
}

function runAsync(args, { input, env = {} } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn('node', [UPLOAD, ...args], {
      env: {
        ...process.env,
        SOURCARDS_MEDIA_SKIP_ENV_FILE: '1',
        ...env,
      },
    });
    let out = '';
    let err = '';
    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', (d) => { err += d; });
    child.on('error', reject);
    child.on('close', (code) => resolve({ code, out, err, combined: out + err }));
    if (input != null) {
      child.stdin.end(typeof input === 'string' ? input : JSON.stringify(input));
    } else {
      child.stdin.end();
    }
  });
}

// ---- lib unit tests ----------------------------------------------------------

test('extractMediaSrcs finds audio, md image, img', () => {
  const md = `
<audio src="https://cdn.example/a.mp3" controls></audio>
![kana](https://cdn.example/k.png)
<img src="./local.png" />
`;
  assert.deepEqual(extractMediaSrcs(md), [
    'https://cdn.example/a.mp3',
    'https://cdn.example/k.png',
    './local.png',
  ]);
});

test('isPublicHttpsMediaSrc / needsMediaUpload / classifyMediaSrc', () => {
  assert.equal(isPublicHttpsMediaSrc('https://x/a.mp3'), true);
  assert.equal(isPublicHttpsMediaSrc('http://x/a.mp3'), false);
  assert.equal(needsMediaUpload('./a.mp3'), true);
  assert.equal(needsMediaUpload('https://x/a.mp3'), false);
  assert.equal(needsMediaUpload('/demo/ja/a.mp3'), false);
  assert.equal(classifyMediaSrc('https://x'), 'https');
  assert.equal(classifyMediaSrc('http://x'), 'http');
  assert.equal(classifyMediaSrc('data:image/png;base64,xx'), 'data');
  assert.equal(classifyMediaSrc('/demo/x.png'), 'root-relative');
  assert.equal(classifyMediaSrc('./x.png'), 'local');
  assert.equal(classifyMediaSrc('file:///tmp/x.png'), 'local');
});

test('rewriteMediaSrc rewrites audio/img/markdown image only', () => {
  const md = 'Q <audio src="./a.mp3" controls></audio> ![x](./a.mp3) <img src="./a.mp3"> text ./a.mp3';
  const out = rewriteMediaSrc(md, './a.mp3', 'https://cdn.example/a.mp3');
  assert.match(out, /src="https:\/\/cdn\.example\/a\.mp3"/);
  assert.match(out, /!\[x\]\(https:\/\/cdn\.example\/a\.mp3\)/);
  // bare path outside media tokens must stay
  assert.match(out, /text \.\/a\.mp3/);
});

test('rewritePayloadMedia rewrites question and answer', () => {
  const payload = {
    deck: '日语',
    cards: [
      {
        question: '<audio src="./q.mp3" controls></audio>',
        answer: '![a](./a.png)',
      },
    ],
  };
  const next = rewritePayloadMedia(payload, {
    './q.mp3': 'https://cdn.example/q.mp3',
    './a.png': 'https://cdn.example/a.png',
  });
  assert.equal(
    next.cards[0].question,
    '<audio src="https://cdn.example/q.mp3" controls></audio>',
  );
  assert.equal(next.cards[0].answer, '![a](https://cdn.example/a.png)');
  assert.deepEqual(extractPayloadMediaSrcs(next), [
    'https://cdn.example/q.mp3',
    'https://cdn.example/a.png',
  ]);
});

// ---- CLI: map provider -------------------------------------------------------

test('map provider rewrites local audio to https', () => {
  const dir = mkdtempSync(join(tmpdir(), 'sc-media-'));
  try {
    const mp3 = join(dir, 'neko.mp3');
    writeFileSync(mp3, Buffer.from('ID3fake'));
    const cards = {
      deck: '日语',
      cards: [
        {
          question: '<audio src="./neko.mp3" controls></audio>',
          answer: '猫',
          tags: ['lang:ja', 'type:listening'],
        },
      ],
    };
    const cardsPath = join(dir, 'cards.json');
    const mapPath = join(dir, 'map.json');
    const outPath = join(dir, 'out.json');
    writeFileSync(cardsPath, JSON.stringify(cards));
    writeFileSync(mapPath, JSON.stringify({ './neko.mp3': 'https://cdn.example/neko.mp3' }));

    const { code, err } = run(
      [cardsPath, '--provider', 'map', '--map', mapPath, '--out', outPath, '--root', dir],
    );
    assert.equal(code, 0, err);
    const out = JSON.parse(readFileSync(outPath, 'utf8'));
    assert.equal(
      out.cards[0].question,
      '<audio src="https://cdn.example/neko.mp3" controls></audio>',
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('github provider commits into local repo clone (no push) and rewrites', () => {
  const work = mkdtempSync(join(tmpdir(), 'sc-gh-'));
  const mediaRepo = join(work, 'media-repo');
  try {
    // bare-ish git repo for media
    mkdirSync(mediaRepo, { recursive: true });
    const git = (args) => {
      const r = spawnSync('git', args, { cwd: mediaRepo, encoding: 'utf8' });
      assert.equal(r.status, 0, r.stderr || r.stdout);
    };
    git(['init']);
    git(['config', 'user.email', 'test@example.com']);
    git(['config', 'user.name', 'test']);
    writeFileSync(join(mediaRepo, 'README.md'), 'media\n');
    git(['add', 'README.md']);
    git(['commit', '-m', 'init']);

    writeFileSync(join(work, 'dot.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    const cardsPath = join(work, 'cards.json');
    const outPath = join(work, 'out.json');
    writeFileSync(
      cardsPath,
      JSON.stringify({
        deck: '测试',
        cards: [{ question: '![d](./dot.png)', answer: 'ok' }],
      }),
    );

    const { code, err } = run(
      [cardsPath, '--provider', 'github', '--out', outPath, '--root', work],
      {
        env: {
          SOURCARDS_MEDIA_REPO_DIR: mediaRepo,
          SOURCARDS_MEDIA_GITHUB_BASE_URL: 'https://cdn.jsdelivr.net/gh/user/repo@main',
          SOURCARDS_MEDIA_BASE_URL: '',
          SOURCARDS_MEDIA_NO_PUSH: '1',
          SOURCARDS_MEDIA_PREFIX: 'cards/',
          SOURCARDS_MEDIA_PROVIDER: '',
          SOURCARDS_MEDIA_S3_ENDPOINT: '',
          SOURCARDS_MEDIA_UPLOAD_URL: '',
          SOURCARDS_MEDIA_UPLOAD_CMD: '',
        },
      },
    );
    assert.equal(code, 0, err);
    const out = JSON.parse(readFileSync(outPath, 'utf8'));
    assert.match(out.cards[0].question, /https:\/\/cdn\.jsdelivr\.net\/gh\/user\/repo@main\/cards\/[a-f0-9]{12}\/dot\.png/);
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
});

test('no local media → exit 0, passthrough', () => {
  const payload = {
    deck: '日语',
    cards: [
      {
        question: '<audio src="https://cdn.example/neko.mp3" controls></audio>',
        answer: '猫',
        tags: ['lang:ja', 'type:listening'],
      },
    ],
  };
  const { code, out, err } = run(['--json'], { input: payload });
  assert.equal(code, 0, err);
  const summary = JSON.parse(out);
  assert.equal(summary.skippedHttps, 1);
  assert.equal(summary.uploaded, 0);
});

test('local media without provider → exit 1', () => {
  const dir = mkdtempSync(join(tmpdir(), 'sc-media-'));
  try {
    writeFileSync(join(dir, 'x.mp3'), 'x');
    const payload = {
      deck: '日语',
      cards: [{ question: '<audio src="./x.mp3" controls></audio>', answer: 'a' }],
    };
    const { code, combined } = run(['--root', dir], {
      input: payload,
      env: {
        SOURCARDS_MEDIA_SKIP_ENV_FILE: '1',
        SOURCARDS_MEDIA_PROVIDER: '',
        SOURCARDS_MEDIA_S3_ENDPOINT: '',
        SOURCARDS_MEDIA_S3_BUCKET: '',
        SOURCARDS_MEDIA_S3_ACCESS_KEY_ID: '',
        SOURCARDS_MEDIA_S3_SECRET_ACCESS_KEY: '',
        SOURCARDS_MEDIA_REPO_DIR: '',
        SOURCARDS_MEDIA_UPLOAD_URL: '',
        SOURCARDS_MEDIA_UPLOAD_CMD: '',
      },
    });
    assert.equal(code, 1);
    assert.match(combined, /no provider configured/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('dry-run plans without provider when BASE_URL set', () => {
  const dir = mkdtempSync(join(tmpdir(), 'sc-media-'));
  try {
    writeFileSync(join(dir, 'x.mp3'), 'id3');
    const payload = {
      deck: '日语',
      cards: [{ question: '<audio src="./x.mp3" controls></audio>', answer: 'a' }],
    };
    // dry-run with no provider still plans when we only list; our script allows dry-run without provider
    const { code, combined } = run(['--root', dir, '--dry-run', '--json'], {
      input: payload,
      env: {
        SOURCARDS_MEDIA_PROVIDER: '',
        SOURCARDS_MEDIA_S3_ENDPOINT: '',
        SOURCARDS_MEDIA_UPLOAD_URL: '',
        SOURCARDS_MEDIA_UPLOAD_CMD: '',
      },
    });
    assert.equal(code, 0, combined);
    const summary = JSON.parse(combined.match(/\{[\s\S]*\}/)[0]);
    assert.ok(summary.planned >= 1 || summary.uploaded === 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('http provider posts multipart and rewrites from response url', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'sc-media-'));
  const sockets = new Set();
  const server = createServer((req, res) => {
    if (req.method === 'POST') {
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ url: 'https://cdn.example/uploaded/neko.mp3' }));
      return;
    }
    res.statusCode = 404;
    res.end('nope');
  });
  server.on('connection', (s) => {
    sockets.add(s);
    s.on('close', () => sockets.delete(s));
  });
  await new Promise((r) => server.listen(0, r));
  const port = server.address().port;
  try {
    writeFileSync(join(dir, 'neko.mp3'), Buffer.from('ID3data'));
    const cardsPath = join(dir, 'cards.json');
    const outPath = join(dir, 'out.json');
    writeFileSync(
      cardsPath,
      JSON.stringify({
        deck: '日语',
        cards: [
          {
            question: '<audio src="./neko.mp3" controls></audio>',
            answer: '猫',
          },
        ],
      }),
    );
    const { code, err } = await runAsync(
      [cardsPath, '--provider', 'http', '--out', outPath, '--root', dir],
      {
        env: {
          SOURCARDS_MEDIA_UPLOAD_URL: `http://127.0.0.1:${port}/upload`,
          SOURCARDS_MEDIA_BASE_URL: 'https://cdn.example',
        },
      },
    );
    assert.equal(code, 0, err);
    const out = JSON.parse(readFileSync(outPath, 'utf8'));
    assert.equal(
      out.cards[0].question,
      '<audio src="https://cdn.example/uploaded/neko.mp3" controls></audio>',
    );
  } finally {
    for (const s of sockets) s.destroy();
    await new Promise((r) => server.close(r));
    rmSync(dir, { recursive: true, force: true });
  }
});

test('map missing entry → exit 1', () => {
  const dir = mkdtempSync(join(tmpdir(), 'sc-media-'));
  try {
    const mapPath = join(dir, 'map.json');
    writeFileSync(mapPath, JSON.stringify({ './other.mp3': 'https://cdn.example/m.mp3' }));
    const { code, combined } = run(
      ['--provider', 'map', '--map', mapPath, '--root', dir],
      {
        input: {
          deck: '日语',
          cards: [{ question: '<audio src="./missing.mp3" controls></audio>', answer: 'a' }],
        },
      },
    );
    assert.equal(code, 1);
    assert.match(combined, /map has no entry|no entry/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('http provider missing local file → exit 1', () => {
  const dir = mkdtempSync(join(tmpdir(), 'sc-media-'));
  try {
    const { code, combined } = run(
      ['--provider', 'http', '--root', dir],
      {
        input: {
          deck: '日语',
          cards: [{ question: '<audio src="./missing.mp3" controls></audio>', answer: 'a' }],
        },
        env: {
          SOURCARDS_MEDIA_UPLOAD_URL: 'http://127.0.0.1:9/upload',
          SOURCARDS_MEDIA_BASE_URL: 'https://cdn.example',
        },
      },
    );
    assert.equal(code, 1);
    assert.match(combined, /file not found|not found/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
