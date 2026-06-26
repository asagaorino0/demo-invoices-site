import type { SiteConfig } from '../types';
import { readGoogleSheetValues } from './google-sheets';
import { getGoogleSheetSetting } from './store/google-sheet-settings';
import { DEFAULT_GOOGLE_SHEET_SETTING_KEY } from '../types';

const defaultConfig: SiteConfig = {
  siteTitle: '請求書デモ',
  headerNote: 'Google スプレッドシート公開 CSV、ローカル CSV、または JSON を読み込みます。',
  heroDescription: '元の DemoUserCheckDialog を public/static 向けに寄せた簡易版です。実データは入れずにお使いください。',
  invoiceSheetCsvUrl: '',
  localInvoiceCsvUrl: '',
  fallbackInvoicesUrl: './invoices.json',
  issuerSheetName: '発行者',
  issuerName: 'konoyubi介護美容（デモ）',
  issuerAddress: '東京都渋谷区神宮前1-2-3 美容ビル2F',
  issuerContact: '03-1234-5678',
  issuerPostalCode: '150-0001',
  issuerEmail: 'info@konoyubi-demo.co.jp',
  issuerInvoiceNumber: 'T1234567890123',
  issuerRepresentativeName: '',
  issuerRepresentativeTitle: '',
  issuerStampUrl: '',
  bankNote: '振込先：○○銀行 0000000',
  defaultTaxRate: 0.1,
  currency: 'JPY'
};

export async function loadSiteConfig(): Promise<SiteConfig> {
  let config = defaultConfig;

  try {
    const configModule = await import('../../invoices-site-config.json');
    config = {
      ...defaultConfig,
      ...configModule.default
    };
  } catch {
    config = defaultConfig;
  }

  const issuerOverrides = await loadIssuerOverrides(config.issuerSheetName);
  return issuerOverrides ? { ...config, ...getBlankIssuerConfig(), ...issuerOverrides } : config;
}

const ISSUER_FIELD_ALIASES: Record<IssuerConfigKey, string[]> = {
  issuerName: [
    'issuerName',
    '発行者名',
    '発行者',
    '会社名',
    '名称',
    'shop',
    'shop名',
    'shopname',
    'shopshopname',
    '店舗名'
  ],
  issuerPostalCode: ['issuerPostalCode', '郵便番号', '〒', 'postalCode', 'shopzip', 'shop郵便番号', '店舗郵便番号'],
  issuerAddress: ['issuerAddress', '住所', '所在地', 'address', 'shop住所', 'shop所在地', 'shopaddress', '店舗住所'],
  issuerContact: ['issuerContact', '電話番号', 'tel', '電話', '連絡先', 'shoptel', 'shop電話番号', '店舗電話番号'],
  issuerEmail: ['issuerEmail', 'email', 'mail', 'メール', 'メールアドレス'],
  issuerInvoiceNumber: [
    'issuerInvoiceNumber',
    '登録番号',
    '適格請求書発行事業者番号',
    'invoiceNumber',
    'shopinvoiceNumber',
    'shop登録番号',
    '店舗登録番号'
  ],
  issuerRepresentativeName: [
    'issuerRepresentativeName',
    '代表者名',
    '代表者',
    'shoprepresentativename',
    '店舗代表者名'
  ],
  issuerRepresentativeTitle: [
    'issuerRepresentativeTitle',
    '代表者肩書き',
    '肩書き',
    '役職',
    'shoprepresentativetitle',
    '店舗代表者肩書き'
  ],
  issuerStampUrl: ['issuerStampUrl', '印影url', '印鑑url', 'shopstampurl', '店舗印影url'],
  bankNote: ['bankNote', '振込先', '振込先情報', 'bank']
};

const ISSUER_META_FIELD_ALIASES = {
  bankName: ['shopbankname', 'bankname', '銀行名', '振込先銀行', '店舗銀行名'],
  bankNumber: ['shopbanknumber', 'banknumber', '口座番号', '振込先口座', '店舗口座番号']
} as const;

type IssuerConfigKey =
  | 'issuerName'
  | 'issuerPostalCode'
  | 'issuerAddress'
  | 'issuerContact'
  | 'issuerEmail'
  | 'issuerInvoiceNumber'
  | 'issuerRepresentativeName'
  | 'issuerRepresentativeTitle'
  | 'issuerStampUrl'
  | 'bankNote';

type IssuerMetaKey = keyof typeof ISSUER_META_FIELD_ALIASES;
type ParsedIssuerValues = Partial<SiteConfig> & Partial<Record<IssuerMetaKey, string>>;

function getBlankIssuerConfig(): Pick<
  SiteConfig,
  | 'issuerName'
  | 'issuerPostalCode'
  | 'issuerAddress'
  | 'issuerContact'
  | 'issuerEmail'
  | 'issuerInvoiceNumber'
  | 'issuerRepresentativeName'
  | 'issuerRepresentativeTitle'
  | 'issuerStampUrl'
  | 'bankNote'
> {
  return {
    issuerName: '',
    issuerPostalCode: '',
    issuerAddress: '',
    issuerContact: '',
    issuerEmail: '',
    issuerInvoiceNumber: '',
    issuerRepresentativeName: '',
    issuerRepresentativeTitle: '',
    issuerStampUrl: '',
    bankNote: ''
  };
}

async function loadIssuerOverrides(sheetName: string): Promise<Partial<SiteConfig> | null> {
  const normalizedSheetName = String(sheetName || '').trim();
  if (!normalizedSheetName) {
    return null;
  }

  try {
    const setting = await getGoogleSheetSetting(DEFAULT_GOOGLE_SHEET_SETTING_KEY);
    if (!setting?.spreadsheetId) {
      return null;
    }

    const result = await readGoogleSheetValues({
      spreadsheetId: setting.spreadsheetId,
      sheetName: normalizedSheetName,
      historySheetName: setting.historySheetName
    });
    return parseIssuerSheetValues(result.values);
  } catch (error) {
    console.warn('[site-config] failed to load issuer sheet', error);
    return null;
  }
}

function parseIssuerSheetValues(values: string[][]): Partial<SiteConfig> | null {
  const firstDataRowIndex = values.findIndex((row) => row.some((cell) => String(cell || '').trim()));
  if (firstDataRowIndex < 0) {
    return null;
  }

  const headerRecord = finalizeIssuerValues(buildIssuerRecordFromHeaderRow(values, firstDataRowIndex));
  if (Object.keys(headerRecord).length > 0) {
    return headerRecord;
  }

  const keyValueRecord = finalizeIssuerValues(buildIssuerRecordFromKeyValueRows(values));
  return Object.keys(keyValueRecord).length > 0 ? keyValueRecord : null;
}

function buildIssuerRecordFromHeaderRow(values: string[][], headerRowIndex: number): ParsedIssuerValues {
  const headerRow = values[headerRowIndex] || [];
  const dataRow = values
    .slice(headerRowIndex + 1)
    .find((row) => row.some((cell) => String(cell || '').trim()));

  if (!dataRow) {
    return {};
  }

  return headerRow.reduce<ParsedIssuerValues>((record, label, index) => {
    const key = resolveIssuerFieldKey(label);
    const value = String(dataRow[index] || '').trim();
    if (key && value) {
      record[key] = value;
    }
    return record;
  }, {});
}

function buildIssuerRecordFromKeyValueRows(values: string[][]): ParsedIssuerValues {
  return values.reduce<ParsedIssuerValues>((record, row) => {
    const label = String(row[0] || '').trim();
    const key = resolveIssuerFieldKey(label);
    if (!key) {
      return record;
    }

    const value = row
      .slice(1)
      .map((cell) => String(cell || '').trim())
      .filter(Boolean)
      .join(' ')
      .trim();

    if (value) {
      record[key] = value;
    }
    return record;
  }, {});
}

function finalizeIssuerValues(values: ParsedIssuerValues): Partial<SiteConfig> {
  const bankNote = values.bankNote || buildBankNote(values.bankName, values.bankNumber);
  const { bankName: _bankName, bankNumber: _bankNumber, ...configValues } = values;

  return bankNote ? { ...configValues, bankNote } : configValues;
}

function buildBankNote(bankName?: string, bankNumber?: string): string {
  const parts = [String(bankName || '').trim(), String(bankNumber || '').trim()].filter(Boolean);
  return parts.length > 0 ? `振込先：${parts.join(' ')}` : '';
}

function resolveIssuerFieldKey(label: string): IssuerConfigKey | IssuerMetaKey | null {
  const configKey = resolveIssuerConfigKey(label);
  if (configKey) {
    return configKey;
  }

  return resolveIssuerMetaKey(label);
}

function resolveIssuerConfigKey(label: string): IssuerConfigKey | null {
  const normalizedLabel = normalizeIssuerLabel(label);
  if (!normalizedLabel) {
    return null;
  }

  for (const [key, aliases] of Object.entries(ISSUER_FIELD_ALIASES) as [IssuerConfigKey, string[]][]) {
    if (aliases.some((alias) => normalizeIssuerLabel(alias) === normalizedLabel)) {
      return key;
    }
  }

  return null;
}

function resolveIssuerMetaKey(label: string): IssuerMetaKey | null {
  const normalizedLabel = normalizeIssuerLabel(label);
  if (!normalizedLabel) {
    return null;
  }

  for (const [key, aliases] of Object.entries(ISSUER_META_FIELD_ALIASES) as [IssuerMetaKey, readonly string[]][]) {
    if (aliases.some((alias) => normalizeIssuerLabel(alias) === normalizedLabel)) {
      return key;
    }
  }

  return null;
}

function normalizeIssuerLabel(label: string): string {
  return String(label || '')
    .trim()
    .toLowerCase()
    .replace(/[：:]/g, '')
    .replace(/[()\[\]{}]/g, '')
    .replace(/\s+/g, '')
    .replace(/[_.-]/g, '');
}
