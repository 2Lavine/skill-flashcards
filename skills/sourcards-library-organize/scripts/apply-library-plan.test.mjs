import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

process.env.SOURCARDS_API_SKIP_ENV_FILE = '1';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCRIPT = join(__dirname, 'apply-library-plan.mjs');
const { parsePlan } = await import('./apply-library-plan.mjs');

const plan = {
  operations: [
    { op: 'rename_category', deckId: 'd1', oldName: '心里学', newName: '心理学' },
    { op: 'merge_category', deckId: 'd1', oldName: '认知偏差', newName: '认知' },
  ],
};

function writePlan(body) {
  const dir = mkdtempSync(join(tmpdir(), 'library-plan-'));
  const file = join(dir, 'plan.json');
  writeFileSync(file, JSON.stringify(body));
  return file;
}

test('parsePlan keeps only rename and merge', () => {
  assert.deepEqual(parsePlan(plan).operations, plan.operations);
  assert.throws(() => parsePlan({ operations: [{ op: 'delete_deck', deckId: 'd', oldName: 'a', newName: 'b' }] }), /rename_category/);
  assert.throws(() => parsePlan({
    operations: [{ op: 'rename_category', deckId: 'd', oldName: 'a', newName: 'a/b' }],
  }), /must not contain/);
  assert.throws(() => parsePlan({
    operations: [{ op: 'merge_category', deckId: 'd', oldName: '认知', newName: '认知' }],
  }), /itself/);
});

test('dry-run prints the plan and does not need a token', async () => {
  const file = writePlan(plan);
  const result = await new Promise((resolve, reject) => {
    const child = spawn('node', [SCRIPT, file], {
      env: { ...process.env, SOURCARDS_API_SKIP_ENV_FILE: '1', FLASHCARD_API_KEY: '' },
      timeout: 10_000,
    });
    let out = '';
    let err = '';
    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', (d) => { err += d; });
    child.on('error', reject);
    child.on('close', (code) => resolve({ code, out, err }));
  });
  assert.equal(result.code, 0, result.err);
  assert.deepEqual(JSON.parse(result.out), { dryRun: true, operations: plan.operations });
});

test('apply sends rename then merge and stops after ok:false', async () => {
  const file = writePlan(plan);
  const seen = [];
  const result = await new Promise((resolve, reject) => {
    const server = createServer((req, res) => {
      const chunks = [];
      req.on('data', (c) => chunks.push(c));
      req.on('end', () => {
        seen.push({ method: req.method, url: req.url, body: Buffer.concat(chunks).toString('utf8'), key: req.headers['x-api-key'] });
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify(seen.length === 1 ? { ok: true } : { ok: false, error: 'missing category' }));
      });
    });
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      const child = spawn('node', [SCRIPT, file, '--apply'], {
        env: {
          ...process.env,
          SOURCARDS_API_SKIP_ENV_FILE: '1',
          FLASHCARD_API_KEY: 'sc_int_test-token',
          SOURCARDS_API_BASE_URL: `http://127.0.0.1:${port}`,
        },
        timeout: 10_000,
      });
      let out = '';
      let err = '';
      child.stdout.on('data', (d) => { out += d; });
      child.stderr.on('data', (d) => { err += d; });
      child.on('error', reject);
      child.on('close', (code) => {
        server.close();
        resolve({ code, out, err });
      });
    });
  });
  assert.equal(result.code, 1, result.err);
  assert.equal(seen.length, 2);
  assert.equal(seen[0].method, 'PUT');
  assert.equal(seen[0].url, '/api/categories/rename');
  assert.equal(seen[0].key, 'sc_int_test-token');
  assert.equal(seen[1].url, '/api/categories/merge');
  const body = JSON.parse(result.out);
  assert.equal(body.applied, 1);
  assert.equal(body.failed.index, 1);
  assert.match(body.failed.error, /missing category/);
});
