import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';

const source = await readFile(new URL('../src/lib/db/project-storage-error.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 }
});

function load(env) {
  const logs = [];
  const context = { exports: {}, process: { env }, console: { error: (...args) => logs.push(args) } };
  vm.runInNewContext(outputText, context);
  return { fallback: context.exports.shouldUseLocalProjectStore, logs };
}

test('development retains local storage when the database is unavailable', () => {
  const { fallback, logs } = load({ NODE_ENV: 'development' });
  assert.equal(fallback(new Error('DATABASE_URL is not configured.')), true);
  assert.equal(fallback(new Error('PostgreSQL client is not ready')), true);
  assert.equal(logs.length, 0);
});

test('production missing database fails explicitly instead of losing state between requests', () => {
  const { fallback, logs } = load({ NODE_ENV: 'production' });
  assert.throws(() => fallback(new Error('DATABASE_URL is not configured.')), /project_database_not_configured/);
  assert.equal(logs[0][1].code, 'project_database_not_configured');
});

test('Vercel also rejects local fallback regardless of NODE_ENV', () => {
  const { fallback } = load({ VERCEL: '1', NODE_ENV: 'development' });
  assert.throws(() => fallback(new Error('ECONNREFUSED')), /project_database_unavailable/);
});

test('connection failures do not expose credentials in logs or response errors', () => {
  const { fallback, logs } = load({ NODE_ENV: 'production' });
  let caught;
  try {
    fallback(new Error('PostgreSQL client is not ready: postgres://user:secret@private-host/db'));
  } catch (error) {
    caught = error;
  }
  assert.match(caught.message, /project_database_unavailable/);
  assert.doesNotMatch(JSON.stringify(logs) + caught.message, /secret|private-host/);
});

test('unrelated database errors remain errors in every environment', () => {
  for (const NODE_ENV of ['development', 'production']) {
    const { fallback } = load({ NODE_ENV });
    assert.equal(fallback(new Error('duplicate key value violates unique constraint')), false);
  }
});
