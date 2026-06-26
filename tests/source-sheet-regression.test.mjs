import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();

async function read(relativePath) {
  return readFile(path.join(root, relativePath), 'utf8');
}

test('README documents one shared source spreadsheet for /projects', async () => {
  const readme = await read('README.md');

  assert.match(readme, /source スプレッドシートは `\/projects` 画面全体で 1 つです/u);
  assert.match(readme, /左上の `Source スプレッドシート` カードで設定した内容が、この画面の取込元と保存先になります/u);
});

test('project sync no longer keys Google Sheets settings by company name', async () => {
  const syncRoute = await read('src/app/api/projects/[projectId]/sync-sheet/route.ts');
  const createRoute = await read('src/app/api/projects/route.ts');
  const page = await read('src/app/projects/page.tsx');

  assert.doesNotMatch(syncRoute, /getGoogleSheetSetting\(bundle\.project\.companyName\)/u);
  assert.match(syncRoute, /getGoogleSheetSetting\(DEFAULT_GOOGLE_SHEET_SETTING_KEY\)/u);
  assert.match(createRoute, /getGoogleSheetSetting\(DEFAULT_GOOGLE_SHEET_SETTING_KEY\)/u);
  assert.match(page, /getGoogleSheetSetting\(DEFAULT_GOOGLE_SHEET_SETTING_KEY\)/u);
});

test('shopKey naming is removed from source tree', async () => {
  const files = [
    'src/app/api/google-sheet-settings/route.ts',
    'src/app/api/imports/sheet/route.ts',
    'src/app/projects/import-panel.tsx',
    'src/lib/db/google-sheet-settings.ts',
    'src/lib/local-store.ts',
    'src/types/google-sheet-setting.ts'
  ];

  for (const file of files) {
    const text = await read(file);
    assert.doesNotMatch(text, /shopKey/u, `${file} should not contain shopKey`);
  }
});

test('issuer box width and stamp position fields flow through project and sheet sync layers', async () => {
  const projectType = await read('src/types/project.ts');
  const csvType = await read('src/types/csv.ts');
  const shared = await read('src/lib/csv/shared.ts');
  const editor = await read('src/app/projects/[projectId]/project-editor.tsx');
  const sheets = await read('src/lib/google-sheets.ts');

  assert.match(projectType, /issuerBoxWidth: number;/u);
  assert.match(projectType, /stampOffsetX: number;/u);
  assert.match(projectType, /stampOffsetY: number;/u);
  assert.match(csvType, /issuerBoxWidth: string;/u);
  assert.match(csvType, /stampOffsetX: string;/u);
  assert.match(csvType, /stampOffsetY: string;/u);
  assert.match(shared, /送り主欄幅: 'issuerBoxWidth'/u);
  assert.match(editor, /allowIssuerResize/u);
  assert.match(editor, /issuerBoxWidth: width/u);
  assert.match(sheets, /issuerBoxWidth: '送り主欄幅'/u);
  assert.match(shared, /角印x: 'stampOffsetX'/u);
  assert.match(shared, /角印y: 'stampOffsetY'/u);
  assert.match(editor, /allowStampReposition/u);
  assert.match(editor, /stampOffsetX: position\.x/u);
  assert.match(editor, /stampOffsetY: position\.y/u);
  assert.match(sheets, /stampOffsetX: '角印X'/u);
  assert.match(sheets, /stampOffsetY: '角印Y'/u);
});
