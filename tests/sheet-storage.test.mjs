import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import ts from 'typescript';

const nativeRequire = createRequire(import.meta.url);
const root = process.cwd();
const target = { spreadsheetId: 'test-sheet', sheetName: 'source', historySheetName: 'history' };
const compiled = new Map();

// Each loader represents a fresh serverless instance. Only the fake remote sheet
// persists; touching the database is an immediate test failure.
function app(remote) {
  const modules = new Map();
  function load(file) {
    file = path.resolve(root, file);
    if (file.endsWith('/lib/db/projects.ts')) return new Proxy({}, { get: () => () => { throw new Error('DB must not be used'); } });
    if (file.endsWith('/lib/store/google-sheet-settings.ts')) return { getGoogleSheetSetting: async () => target };
    if (file.endsWith('/lib/tenant.ts')) return { getCurrentTenantScopeKey: async () => 'tenant' };
    if (modules.has(file)) return modules.get(file).exports;
    const module = { exports: {} };
    modules.set(file, module);
    if (!compiled.has(file)) compiled.set(file, ts.transpileModule(readFileSync(file, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 }
    }).outputText);
    const require = (name) => {
      if (name === 'node:crypto') return { createSign: () => ({ update() {}, end() {}, sign: () => Buffer.from('fake-signature') }) };
      if (name === 'next/headers') return { cookies: async () => ({ get: () => ({ value: 'tenant' }) }) };
      if (!name.startsWith('.')) return nativeRequire(name);
      const base = path.resolve(path.dirname(file), name);
      const resolved = [base + '.ts', base + '.tsx', path.join(base, 'index.ts')].find(existsSync);
      if (!resolved) throw new Error(`Cannot resolve ${name} from ${file}`);
      return load(resolved);
    };
    vm.runInNewContext(compiled.get(file), {
      module, exports: module.exports, require, Buffer, URL, URLSearchParams, Response, Request,
      structuredClone, Error, crypto: { randomUUID }, console,
      process: { env: { NODE_ENV: 'production', VERCEL: '1', GOOGLE_SERVICE_ACCOUNT_EMAIL: 'fake@example.test', GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY: 'fake' } },
      fetch: remote.fetch
    }, { filename: file });
    return module.exports;
  }
  return { load, store: load('src/lib/store/projects.ts') };
}

function fakeSheets() {
  const remote = { values: [], fail: false, writes: [], history: [] };
  const write = (range, values) => {
    const table = range.includes("'history'") ? remote.history : remote.values;
    const row = Number(range.match(/!A(\d+)/)?.[1] || 1) - 1;
    values.forEach((cells, offset) => {
      table[row + offset] ||= [];
      cells.forEach((value, col) => { if (value !== null) table[row + offset][col] = value; });
    });
  };
  remote.fetch = async (input, options = {}) => {
    const url = String(input);
    if (url.includes('oauth2.googleapis.com')) return Response.json({ access_token: 'fake-token' });
    assert.ok(!url.includes(':clear'), 'must never clear the sheet before writing');
    const decoded = decodeURIComponent(url);
    const isWrite = options.method && options.method !== 'GET';
    if (isWrite) {
      if (remote.fail) return Response.json({ error: { code: 403, message: 'denied' } }, { status: 403 });
      const body = JSON.parse(options.body);
      remote.writes.push({ url, body });
      if (url.includes('/values:batchUpdate')) for (const item of body.data) write(item.range, item.values);
      else if (decoded.includes(':append')) {
        const table = decoded.includes("'history'") ? remote.history : remote.values;
        table.push(...body.values);
      } else if (options.method === 'PUT') write(decoded.split('/values/')[1].split('?')[0], body.values);
      else throw new Error(`Unexpected write ${url}`);
      return Response.json({});
    }
    if (url.includes('/values/')) return Response.json({ values: decoded.includes("'history'") ? remote.history : remote.values });
    return Response.json({ sheets: [{ properties: { title: 'source' } }, { properties: { title: 'history' } }] });
  };
  return remote;
}

function setup() {
  const remote = fakeSheets();
  const instance = app(remote);
  const headers = instance.load('src/types/csv.ts').INVOICE_CSV_HEADERS.filter((key) =>
    !['selectedForInvoice', 'selectionUpdatedAt', 'projectDefaultRemarks', 'projectStatus'].includes(key));
  const row = (userId, reservationId) => ({ userId, userName: userId, companyName: 'company',
    reservationId, date: '2026-09-30', service: 'service', price: '25000', baseQuantity: '1',
    baseUnit: '回', taxIncluded: 'FALSE', visible: 'TRUE', isCollected: 'FALSE',
    defaultInvoiceDateMode: 'custom', invoiceDate: '2026-10-01', remarks: 'line remarks', outsourceUnitPrice: '123' });
  remote.values = [[...headers, 'externalFormula'], ...[row('0100001', 'r1'), row('0100001', 'r2'), row('other', 'r3')]
    .map((record) => [...headers.map((key) => record[key] || ''), '=1+1'])];
  return { remote, id: 'tenant__project_0100001' };
}

function lineInput(line, overrides = {}) {
  return { ...line, lineId: line.id, ...overrides };
}

test('DB-free header, selection order and collection edits survive fresh instances', async () => {
  const { remote, id } = setup();
  let detail = await app(remote).store.getProjectDetail(id);
  assert.ok(detail.project);
  assert.equal(detail.serviceLines.length, 2);
  await app(remote).store.updateProjectHeader({ ...detail.project, projectId: id, subject: 'updated', defaultRemarks: 'project remarks', issuerBoxWidth: 215 });
  detail = await app(remote).store.getProjectDetail(id);
  assert.equal(detail.project.subject, 'updated');
  assert.equal(detail.project.defaultRemarks, 'project remarks');
  assert.equal(detail.project.issuerBoxWidth, 215);
  assert.equal(detail.serviceLines[0].remarks, 'line remarks');
  const ids = Array.from(detail.serviceLines, (line) => line.id).reverse();
  await app(remote).store.replaceProjectSelections(id, [ids[0]], ids);
  detail = await app(remote).store.getProjectDetail(id);
  assert.deepEqual(Array.from(detail.invoiceSelections, (sel) => sel.lineId), ids);
  assert.deepEqual(Array.from(detail.invoiceSelections, (sel) => sel.selectedForInvoice), [true, false]);
  const line = detail.serviceLines.find((item) => item.id === ids[0]);
  await app(remote).store.updateServiceLine(lineInput(line, { collectionStatus: 'collected', collectedAt: '2026-10-05', receiptIssuedAt: '2026-10-06' }));
  detail = await app(remote).store.getProjectDetail(id);
  assert.equal(detail.serviceLines.find((item) => item.id === line.id).receiptIssuedAt, '2026-10-06');
  assert.equal(detail.invoiceSelections.find((item) => item.lineId === line.id).selectedForInvoice, false);
  assert.equal(remote.values[3][0], 'other');
  const formulaIndex = remote.values[0].indexOf('externalFormula');
  const outsourceIndex = remote.values[0].indexOf('outsourceUnitPrice');
  assert.equal(remote.values[1][formulaIndex], '=1+1');
  assert.equal(remote.values[1][outsourceIndex], '123');
});

test('create, duplicate and delete lines persist; deleting the last line preserves the project', async () => {
  const { remote, id } = setup();
  const original = await app(remote).store.getProjectDetail(id);
  const created = await app(remote).store.createServiceLine({ ...original.serviceLines[0], reservationId: 'new' });
  assert.equal((await app(remote).store.getProjectDetail(id)).serviceLines.length, 3);
  const duplicate = await app(remote).store.duplicateServiceLine({ projectId: id, lineId: created.id });
  assert.ok(duplicate);
  const all = await app(remote).store.getProjectDetail(id);
  for (const line of all.serviceLines) await app(remote).store.deleteServiceLine(id, line.id);
  const empty = await app(remote).store.getProjectDetail(id);
  assert.ok(empty.project);
  assert.equal(empty.serviceLines.length, 0);
  assert.equal((await app(remote).store.listProjectSummaries()).length, 2);
});

test('source refresh does not write or access a database; export reads source data', async () => {
  const { remote, id } = setup();
  const result = await app(remote).load('src/lib/source-sheet-sync.ts').syncProjectsFromSourceSheet();
  assert.equal(result.projectCount, 2);
  assert.equal(remote.writes.length, 0);
  assert.ok((await app(remote).store.getProjectExportBundle(id)).project);
});

test('sheet write failure propagates and leaves existing data intact', async () => {
  const { remote, id } = setup();
  const detail = await app(remote).store.getProjectDetail(id);
  const before = JSON.stringify(remote.values);
  remote.fail = true;
  await assert.rejects(app(remote).store.updateProjectHeader({ ...detail.project, projectId: id, subject: 'fail' }), /アクセス権/);
  assert.equal(JSON.stringify(remote.values), before);
});

test('project API saves and syncs an existing sheet-only project without a DB snapshot', async () => {
  const { remote, id } = setup();
  const params = { params: Promise.resolve({ projectId: id }) };
  const detail = await app(remote).store.getProjectDetail(id);
  const route = app(remote).load('src/app/api/projects/[projectId]/route.ts');
  const response = await route.PATCH(new Request(`https://example.test/api/projects/${id}`, {
    method: 'PATCH', body: JSON.stringify({ ...detail.project, subject: 'API saved' })
  }), params);
  assert.equal(response.status, 200);
  const read = await app(remote).load('src/app/api/projects/[projectId]/route.ts').GET(new Request('https://example.test'), params);
  assert.equal((await read.json()).project.subject, 'API saved');
  const sync = await app(remote).load('src/app/api/projects/[projectId]/sync-sheet/route.ts').POST(new Request('https://example.test'), params);
  assert.equal(sync.status, 200);
  assert.equal((await app(remote).store.getProjectDetail(id)).project.status, 'exported');
  remote.fail = true;
  const failed = await app(remote).load('src/app/api/projects/[projectId]/route.ts').PATCH(new Request('https://example.test', {
    method: 'PATCH', body: JSON.stringify({ ...detail.project, subject: 'failed' })
  }), params);
  assert.equal(failed.status, 500);
  assert.match((await failed.json()).message, /アクセス権/);
});

test('independent concurrent line edits do not overwrite each other', async () => {
  const { remote, id } = setup();
  const before = await app(remote).store.getProjectDetail(id);
  // Both requests read the same snapshot before either mutation writes.
  await Promise.all(before.serviceLines.map((line, index) => app(remote).store.updateServiceLine(
    lineInput(line, { memo: `edited ${index}` })
  )));
  const after = await app(remote).store.getProjectDetail(id);
  for (const [index, line] of before.serviceLines.entries()) {
    assert.equal(after.serviceLines.find((item) => item.id === line.id).memo, `edited ${index}`);
  }
});
