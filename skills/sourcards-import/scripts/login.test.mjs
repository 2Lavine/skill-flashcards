import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  assertSafeVerificationUrl,
  DEFAULT_API_BASE,
  resolveApiBase,
  runLogin,
  waitForAuthorization,
} from './login.mjs';

test('resolveApiBase trims trailing slash', () => {
  assert.equal(resolveApiBase({}), DEFAULT_API_BASE);
  assert.equal(
    resolveApiBase({ SOURCARDS_API_BASE_URL: 'http://localhost:3001/' }),
    'http://localhost:3001',
  );
});

test('assertSafeVerificationUrl allows prod and local, rejects others', () => {
  const api = DEFAULT_API_BASE;
  assert.equal(
    assertSafeVerificationUrl(`${api}/cli/authorize?user_code=ABCD-EFGH`, api).pathname,
    '/cli/authorize',
  );
  assert.equal(
    assertSafeVerificationUrl('http://localhost:5173/cli/authorize?user_code=ABCD-EFGH', api)
      .origin,
    'http://localhost:5173',
  );
  assert.throws(
    () => assertSafeVerificationUrl('https://evil.example/cli/authorize?user_code=X', api),
    /unexpected verification origin/,
  );
  assert.throws(
    () => assertSafeVerificationUrl(`${api}/settings`, api),
    /Unexpected verification path/,
  );
});

test('waitForAuthorization returns the key once and never logs it', async () => {
  let polls = 0;
  const fetchImpl = async () => {
    polls += 1;
    if (polls < 2) return jsonRes({ status: 'pending', interval: 1 });
    return jsonRes({ status: 'authorized', apiKey: 'sc_int_secret' });
  };
  let t = 0;
  const key = await waitForAuthorization({
    apiBase: 'https://sourcard.sourmonkey.xyz',
    deviceCode: 'device',
    expiresIn: 30,
    interval: 1,
    fetchImpl,
    sleep: async (ms) => {
      t += ms;
    },
    now: () => t,
  });
  assert.equal(key, 'sc_int_secret');
  assert.equal(polls, 2);
});

test('runLogin opens an allowlisted URL, persists token, does not print it', async () => {
  const root = mkdtempSync(join(tmpdir(), 'sourcards-login-'));
  const scripts = join(root, 'skill', 'scripts');
  mkdirSync(scripts, { recursive: true });
  const logs = [];
  const opened = [];
  let poll = 0;
  const fetchImpl = async (url, init) => {
    if (String(url).endsWith('/api/cli/device/start')) {
      return jsonRes({
        device_code: 'dev-1',
        user_code: 'ABCD-EFGH',
        verification_uri: `${DEFAULT_API_BASE}/cli/authorize`,
        verification_uri_complete: `${DEFAULT_API_BASE}/cli/authorize?user_code=ABCD-EFGH`,
        expires_in: 30,
        interval: 1,
      });
    }
    poll += 1;
    assert.equal(JSON.parse(init.body).device_code, 'dev-1');
    return jsonRes({ status: 'authorized', apiKey: 'sc_int_from-login' });
  };
  try {
    const { file } = await runLogin({
      env: {},
      scriptDir: scripts,
      fetchImpl,
      openUrl: async (url) => {
        opened.push(url);
        return true;
      },
      log: (msg) => logs.push(msg),
      sleep: async () => {},
      now: (() => {
        let t = 0;
        return () => {
          t += 1000;
          return t;
        };
      })(),
    });
    const saved = readFileSync(file, 'utf8');
    assert.match(saved, /FLASHCARD_API_KEY=sc_int_from-login/);
    assert.equal(opened[0], `${DEFAULT_API_BASE}/cli/authorize?user_code=ABCD-EFGH`);
    assert.ok(logs.some((line) => line.includes('ABCD-EFGH')));
    assert.ok(!logs.join('\n').includes('sc_int_from-login'));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('runLogin refuses a hostile verification URL', async () => {
  await assert.rejects(
    () =>
      runLogin({
        env: {},
        fetchImpl: async () =>
          jsonRes({
            device_code: 'dev-1',
            user_code: 'ABCD-EFGH',
            verification_uri: 'https://evil.example/cli/authorize',
            verification_uri_complete: 'https://evil.example/cli/authorize?user_code=ABCD-EFGH',
            expires_in: 30,
            interval: 1,
          }),
        openUrl: async () => true,
        log: () => {},
      }),
    /unexpected verification origin/,
  );
});

function jsonRes(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  };
}
