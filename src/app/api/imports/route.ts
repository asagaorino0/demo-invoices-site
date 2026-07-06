import { importInvoiceCsvRows, parseInvoiceCsvText } from '../../../lib/csv/import';
import { getCurrentWorkspaceKey } from '../../../lib/workspace';
import { persistImportedBundle } from '../../../lib/store/projects';
import * as XLSX from 'xlsx';

export async function POST(request: Request): Promise<Response> {
  try {
    const workspaceKey = await getCurrentWorkspaceKey();
    const formData = await request.formData();
    const file = formData.get('file');

    if (!(file instanceof File)) {
      return Response.json(
        {
          error: 'file_required',
          message: 'CSV または Excel ファイルを指定してください。'
        },
        { status: 400 }
      );
    }

    const sourceName = String(formData.get('sourceName') || file.name || 'upload.csv');
    const sourceType = detectSourceType(file);
    const text = await readImportText(file);
    const rows = parseInvoiceCsvText(text);
    const bundle = importInvoiceCsvRows(rows, { workspaceKey });
    const importId = crypto.randomUUID();

    const persisted = await persistImportedBundle({
      importId,
      sourceName,
      sourceType,
      rowCount: rows.length,
      warnings: bundle.warnings,
      projects: bundle.projects,
      serviceLines: bundle.serviceLines,
      invoiceSelections: bundle.invoiceSelections
    });

    return Response.json({
      ...persisted,
      warnings: bundle.warnings
    });
  } catch (error) {
    return Response.json(
      {
        error: 'failed_to_import_csv',
        message: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

async function readImportText(file: File): Promise<string> {
  const isExcel = detectSourceType(file) === 'xlsx';

  if (!isExcel) {
    return file.text();
  }

  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array' });
  const firstSheetName = workbook.SheetNames[0];

  if (!firstSheetName) {
    throw new Error('Excel ファイルにシートがありません。');
  }

  const sheet = workbook.Sheets[firstSheetName];
  return XLSX.utils.sheet_to_csv(sheet, { blankrows: false });
}

function detectSourceType(file: File): 'csv' | 'xlsx' {
  const lowerName = file.name.toLowerCase();
  const isExcel =
    lowerName.endsWith('.xlsx') ||
    lowerName.endsWith('.xls') ||
    file.type.includes('spreadsheetml') ||
    file.type.includes('ms-excel');

  return isExcel ? 'xlsx' : 'csv';
}
