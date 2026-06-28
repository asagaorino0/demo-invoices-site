import { createProject, listProjectSummaries, markProjectAsExported } from '../../../lib/store/projects';
import { normalizeCompanyName } from '../../../lib/project-fields';
import { validateProjectInput } from '../../../lib/validation';
import { getGoogleSheetSetting } from '../../../lib/store/google-sheet-settings';
import { getGoogleSheetsErrorStatus, readGoogleSheetValues, syncProjectToGoogleSheet } from '../../../lib/google-sheets';
import { normalizeHeader, stableId } from '../../../lib/csv/shared';
import { DEFAULT_GOOGLE_SHEET_SETTING_KEY, type Project } from '../../../types';

export async function GET(): Promise<Response> {
  try {
    const projects = await listProjectSummaries();

    return Response.json({
      projects,
      count: projects.length
    });
  } catch (error) {
    return Response.json(
      {
        error: 'failed_to_list_projects',
        message: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    const body = (await request.json()) as {
      customerName?: string;
      subject?: string;
      defaultInvoiceDateMode?: Project['defaultInvoiceDateMode'];
      invoiceRecipient?: string;
      facilityName?: string;
      companyName?: string;
      issueDate?: string | null;
      defaultRemarks?: string;
      issuerBoxOffsetX?: number;
      issuerBoxOffsetY?: number;
      issuerBoxWidth?: number;
      stampOffsetX?: number;
      stampOffsetY?: number;
    };

    const input = {
      customerName: String(body.customerName || '').trim(),
      subject: String(body.subject || '').trim(),
      defaultInvoiceDateMode: body.defaultInvoiceDateMode || 'monthEnd',
      invoiceRecipient: String(body.invoiceRecipient || '').trim(),
      facilityName: String(body.facilityName || '').trim(),
      companyName: normalizeCompanyName({
        companyName: String(body.companyName || '').trim(),
        invoiceRecipient: String(body.invoiceRecipient || '').trim()
      }),
      issueDate: body.issueDate || null,
      defaultRemarks: String(body.defaultRemarks || '').trim(),
      issuerBoxOffsetX: Number(body.issuerBoxOffsetX || 0),
      issuerBoxOffsetY: Number(body.issuerBoxOffsetY || 0),
      issuerBoxWidth: Number(body.issuerBoxWidth || 0),
      stampOffsetX: Number(body.stampOffsetX || 0),
      stampOffsetY: Number(body.stampOffsetY || 0)
    };
    const validation = validateProjectInput(input);
    if (!validation.ok) {
      return Response.json(
        { error: 'invalid_project_input', message: validation.message },
        { status: 400 }
      );
    }

    const setting = await getGoogleSheetSetting(DEFAULT_GOOGLE_SHEET_SETTING_KEY).catch(() => null);
    const sourceSheetCustomerId = setting
      ? await generateCustomerIdFromSourceSheet({
          spreadsheetId: setting.spreadsheetId,
          sheetName: setting.sheetName,
          companyName: input.companyName,
          facilityName: input.facilityName
        })
      : null;

    if (setting) {
      try {
        const project = buildSourceSheetProject({
          ...input,
          customerId: sourceSheetCustomerId || ''
        });
        const result = await syncProjectToGoogleSheet({
          project,
          serviceLines: [],
          invoiceSelections: [],
          target: {
            spreadsheetId: setting.spreadsheetId,
            sheetName: setting.sheetName,
            historySheetName: setting.historySheetName
          }
        });
        await markProjectAsExported(project.id).catch(() => undefined);
        const sheetSync = {
          ok: true,
          spreadsheetId: result.spreadsheetId,
          sheetName: result.sheetName,
          rowCount: result.rowCount,
          message: `${result.rowCount} 行を Google Sheets に保存しました。`
        };
        return Response.json(
          {
            project,
            message: '新規利用者を登録し、Google Sheets に保存しました。',
            sheetSync
          },
          { status: 201 }
        );
      } catch (error) {
        const status = getGoogleSheetsErrorStatus(error);
        const sheetSync = {
          ok: false,
          message: error instanceof Error ? error.message : 'Google Sheets への保存に失敗しました。'
        };
        return Response.json(
          {
            error: 'failed_to_create_project_in_google_sheet',
            message: sheetSync.message || '新規利用者を Google Sheets に保存できませんでした。',
            sheetSync
          },
          { status: status || 500 }
        );
      }
    }

    const project = await createProject({
      ...input,
      customerId: sourceSheetCustomerId || undefined
    });

    return Response.json({ project, message: '新規利用者を登録しました。', sheetSync: null }, { status: 201 });
  } catch (error) {
    return Response.json(
      {
        error: 'failed_to_create_project',
        message: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

function buildSourceSheetProject(
  input: Omit<Project, 'id' | 'importId' | 'status' | 'createdAt' | 'updatedAt'> & { customerId: string }
): Project {
  const now = new Date().toISOString();

  return {
    id: stableId('project', input.customerId),
    importId: null,
    customerId: input.customerId,
    customerName: input.customerName,
    subject: input.subject,
    defaultInvoiceDateMode: input.defaultInvoiceDateMode,
    invoiceRecipient: input.invoiceRecipient,
    facilityName: input.facilityName,
    companyName: input.companyName,
    issueDate: input.issueDate,
    defaultRemarks: input.defaultRemarks,
    issuerBoxOffsetX: input.issuerBoxOffsetX,
    issuerBoxOffsetY: input.issuerBoxOffsetY,
    issuerBoxWidth: input.issuerBoxWidth,
    stampOffsetX: input.stampOffsetX,
    stampOffsetY: input.stampOffsetY,
    status: 'draft',
    createdAt: now,
    updatedAt: now
  };
}

async function generateCustomerIdFromSourceSheet(input: {
  spreadsheetId: string;
  sheetName: string;
  companyName: string;
  facilityName: string;
}): Promise<string> {
  const sheet = await readGoogleSheetValues({
    spreadsheetId: input.spreadsheetId,
    sheetName: input.sheetName
  });
  const [headerRow, ...dataRows] = sheet.values;
  const headerKeys = (headerRow || []).map((value) => normalizeHeader(String(value || '')));
  const userIdIndex = headerKeys.indexOf('userId');
  const companyNameIndex = headerKeys.indexOf('companyName');
  const facilityNameIndex = headerKeys.indexOf('facilityName');

  if (userIdIndex < 0 || companyNameIndex < 0 || facilityNameIndex < 0) {
    throw new Error('Google Sheets の userId / companyName / facilityName 列を確認してください。');
  }

  const records = dataRows.map((row) => ({
    customerId: String(row[userIdIndex] || '').trim(),
    companyName: String(row[companyNameIndex] || '').trim(),
    facilityName: String(row[facilityNameIndex] || '').trim()
  }));

  return generateCustomerIdFromRecords(records, input.companyName, input.facilityName);
}

function generateCustomerIdFromRecords(
  records: Array<{ customerId: string; companyName: string; facilityName: string }>,
  companyName: string,
  facilityName: string
): string {
  const normalizedCompanyName = String(companyName || '').trim();
  const normalizedFacilityName = String(facilityName || '').trim();

  if (!normalizedCompanyName) {
    throw new Error('会社名を入力してください。');
  }

  const normalizedRecords = records.map((record) => ({
    customerId: String(record.customerId || '').trim(),
    companyName: String(record.companyName || '').trim(),
    facilityName: String(record.facilityName || '').trim()
  }));
  const parsedRecords = normalizedRecords
    .map((record) => {
      const match = record.customerId.match(/^(\d{2})(\d{2})(\d{3})$/);
      if (!match) return null;
      return {
        companyName: record.companyName,
        facilityName: record.facilityName,
        companyCode: Number(match[1]),
        facilityCode: Number(match[2]),
        userCode: Number(match[3])
      };
    })
    .filter((record): record is NonNullable<typeof record> => Boolean(record));

  const companyNames = Array.from(new Set(normalizedRecords.map((record) => record.companyName).filter(Boolean)));
  const sameCompanyRecords = parsedRecords.filter((record) => record.companyName === normalizedCompanyName);
  const usedCompanyCodes = new Set(parsedRecords.map((record) => record.companyCode));
  const companyCode =
    sameCompanyRecords[0]?.companyCode ||
    resolveOrdinalCode(companyNames, normalizedCompanyName, usedCompanyCodes, '会社コード');

  const facilityNamesForCompany = Array.from(
    new Set(
      normalizedRecords
        .filter((record) => record.companyName === normalizedCompanyName)
        .map((record) => record.facilityName)
        .filter(Boolean)
    )
  );
  const facilityCode =
    normalizedFacilityName === ''
      ? 0
      : sameCompanyRecords.find((record) => record.facilityName === normalizedFacilityName)?.facilityCode ||
        resolveOrdinalCode(
          facilityNamesForCompany,
          normalizedFacilityName,
          new Set(sameCompanyRecords.map((record) => record.facilityCode).filter((code) => code > 0)),
          '施設コード'
        );

  const sameGroupRecords = normalizedRecords.filter(
    (record) => record.companyName === normalizedCompanyName && record.facilityName === normalizedFacilityName
  );
  const sameGroupParsedRecords = parsedRecords.filter(
    (record) => record.companyName === normalizedCompanyName && record.facilityName === normalizedFacilityName
  );
  const userCode = nextAvailableCode(
    new Set(sameGroupParsedRecords.map((record) => record.userCode)),
    sameGroupRecords.length + 1,
    999,
    '利用者コード'
  );

  return `${padCode(companyCode, 2)}${padCode(facilityCode, 2)}${padCode(userCode, 3)}`;
}

function resolveOrdinalCode(existingNames: string[], targetName: string, usedCodes: Set<number>, label: string): number {
  const ordinal = existingNames.indexOf(targetName) + 1;
  if (ordinal > 0) {
    if (ordinal > 99) {
      throw new Error(`${label}の採番上限に達しました。`);
    }
    return ordinal;
  }

  return nextAvailableCode(usedCodes, existingNames.length + 1, 99, label);
}

function nextAvailableCode(usedCodes: Set<number>, start: number, max: number, label: string): number {
  for (let code = Math.max(1, start); code <= max; code += 1) {
    if (!usedCodes.has(code)) {
      return code;
    }
  }

  throw new Error(`${label}の採番上限に達しました。`);
}

function padCode(value: number, length: number): string {
  return String(value).padStart(length, '0');
}
