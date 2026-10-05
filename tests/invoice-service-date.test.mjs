import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';

const source = await readFile(new URL('../src/lib/invoice/preview.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 }
});
const context = { exports: {} };
vm.runInNewContext(outputText, context);
const { buildDocumentRows, getInvoiceLines, getReceiptLines, calcTotals } = context.exports;

const line = {
  id: 'line-1', reservationId: 'reservation-1', serviceDate: '2026-09-30',
  serviceName: 'BSJ業務支援', price: 25000, quantity: 1, unit: '式',
  taxIncluded: false, extraCharges: [], collectionStatus: 'uncollected', visible: true
};

test('service date can be hidden without removing the selected invoice line or its amount', () => {
  for (const visible of [true, false]) {
    const input = { ...line, visible };
    const selected = getInvoiceLines([input], [input.id]);
    assert.equal(selected.length, 1);
    const row = buildDocumentRows(selected)[0];
    assert.equal(row.label, visible ? '9月30日 BSJ業務支援' : 'BSJ業務支援');
    assert.equal(row.qty, '1式');
    assert.equal(row.total, 25000);
    assert.equal(calcTotals(selected, { defaultTaxRate: 0.1 }).total, 27500);
    assert.equal(input.serviceDate, '2026-09-30');
  }
});

test('selection and collection status still control which lines are invoiced', () => {
  assert.equal(getInvoiceLines([{ ...line, visible: false }], []).length, 0);
  assert.equal(getInvoiceLines([{ ...line, collectionStatus: 'collected' }], [line.id]).length, 0);
});

test('receipt rows use the same date setting and an empty date adds no whitespace', () => {
  const collected = { ...line, collectionStatus: 'collected', visible: false };
  assert.equal(buildDocumentRows(getReceiptLines([collected]))[0].label, 'BSJ業務支援');
  assert.equal(buildDocumentRows([{ ...line, serviceDate: null }])[0].label, 'BSJ業務支援');
});
