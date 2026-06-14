import type { SiteConfig } from '../types';

const defaultConfig: SiteConfig = {
  siteTitle: '請求書デモ',
  headerNote: 'Google スプレッドシート公開 CSV、ローカル CSV、または JSON を読み込みます。',
  heroDescription: '元の DemoUserCheckDialog を public/static 向けに寄せた簡易版です。実データは入れずにお使いください。',
  invoiceSheetCsvUrl: '',
  localInvoiceCsvUrl: '',
  fallbackInvoicesUrl: './invoices.json',
  issuerName: 'konoyubi介護美容（デモ）',
  issuerAddress: '東京都渋谷区神宮前1-2-3 美容ビル2F',
  issuerContact: '03-1234-5678',
  issuerPostalCode: '150-0001',
  issuerEmail: 'info@konoyubi-demo.co.jp',
  issuerInvoiceNumber: 'T1234567890123',
  bankNote: '振込先：○○銀行 0000000',
  defaultTaxRate: 0.1,
  currency: 'JPY'
};

export async function loadSiteConfig(): Promise<SiteConfig> {
  try {
    const configModule = await import('../../invoices-site-config.json');
    return {
      ...defaultConfig,
      ...configModule.default
    };
  } catch {
    return defaultConfig;
  }
}
