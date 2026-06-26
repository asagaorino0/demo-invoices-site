import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();

async function read(relativePath) {
  return readFile(path.join(root, relativePath), 'utf8');
}

test('site config includes issuer sheet name defaults', async () => {
  const typeFile = await read('src/types/site-config.ts');
  const configFile = await read('src/lib/site-config.ts');
  const jsonFile = await read('invoices-site-config.json');

  assert.match(typeFile, /issuerSheetName: string;/u);
  assert.match(typeFile, /issuerRepresentativeName: string;/u);
  assert.match(typeFile, /issuerRepresentativeTitle: string;/u);
  assert.match(typeFile, /issuerStampUrl: string;/u);
  assert.match(configFile, /issuerSheetName: '発行者'/u);
  assert.match(jsonFile, /"issuerSheetName": "発行者"/u);
  assert.match(jsonFile, /"issuerRepresentativeName": ""/u);
  assert.match(jsonFile, /"issuerRepresentativeTitle": ""/u);
  assert.match(jsonFile, /"issuerStampUrl": ""/u);
});

test('loadSiteConfig overlays issuer values from the shared spreadsheet setting', async () => {
  const configFile = await read('src/lib/site-config.ts');

  assert.match(configFile, /getGoogleSheetSetting\(DEFAULT_GOOGLE_SHEET_SETTING_KEY\)/u);
  assert.match(configFile, /readGoogleSheetValues\(\{/u);
  assert.match(configFile, /sheetName: normalizedSheetName/u);
  assert.match(configFile, /buildIssuerRecordFromHeaderRow/u);
  assert.match(configFile, /buildIssuerRecordFromKeyValueRows/u);
  assert.match(configFile, /'shop'/u);
  assert.match(configFile, /'shop住所'/u);
  assert.match(configFile, /'shopshopname'/u);
  assert.match(configFile, /'shopzip'/u);
  assert.match(configFile, /'shoptel'/u);
  assert.match(configFile, /'shopinvoiceNumber'/u);
  assert.match(configFile, /'shoprepresentativename'/u);
  assert.match(configFile, /'shoprepresentativetitle'/u);
  assert.match(configFile, /'shopstampurl'/u);
  assert.match(configFile, /'shopbankname'/u);
  assert.match(configFile, /'shopbanknumber'/u);
  assert.match(configFile, /getBlankIssuerConfig\(\)/u);
  assert.match(configFile, /\{ \.\.\.config, \.\.\.getBlankIssuerConfig\(\), \.\.\.issuerOverrides \}/u);
  assert.match(configFile, /buildBankNote\(values\.bankName, values\.bankNumber\)/u);
});

test('invoice preview hides empty issuer fields', async () => {
  const previewFile = await read('src/components/invoice/invoice-preview.tsx');
  const cssFile = await read('src/app/globals.css');

  assert.match(previewFile, /issuerPostalCode \? <p className="invoice-doc-company-postal">〒\{issuerPostalCode\}<\/p> : null/u);
  assert.match(previewFile, /issuerContact \? <p className="invoice-doc-company-contact">TEL：\{issuerContact\}<\/p> : null/u);
  assert.match(previewFile, /issuerInvoiceNumber \? <p className="invoice-doc-company-number">登録番号：\{issuerInvoiceNumber\}<\/p> : null/u);
  assert.match(previewFile, /issuerRepresentativeName \|\| issuerRepresentativeTitle/u);
  assert.match(previewFile, /issuerStampUrl \? \(/u);
  assert.match(previewFile, /allowIssuerResize/u);
  assert.match(previewFile, /onIssuerWidthChange/u);
  assert.match(previewFile, /project\.issuerBoxWidth/u);
  assert.match(previewFile, /allowStampReposition/u);
  assert.match(previewFile, /onStampPositionChange/u);
  assert.match(previewFile, /project\.stampOffsetX/u);
  assert.match(previewFile, /project\.stampOffsetY/u);
  assert.match(previewFile, /issuerStampUrl \? ' has-stamp' : ''/u);
  assert.match(previewFile, /invoice-doc-company-email/u);
  assert.match(previewFile, /invoice-doc-company-stamp/u);
  assert.match(cssFile, /\.invoice-doc \{\s+width: 190mm;/u);
  assert.match(cssFile, /\.invoice-doc-header \{\s+display: grid;\s+grid-template-columns: minmax\(0, 1fr\) auto;\s+gap: 18px;/u);
  assert.match(cssFile, /\.invoice-doc-company \{\s+position: relative;\s+width: fit-content;/u);
  assert.match(cssFile, /\.invoice-doc-company-resize-handle \{/u);
});
