export interface KonoyubiIssuerSeed {
  shopId?: string;
  issuerName?: string;
  issuerPostalCode?: string;
  issuerAddress?: string;
  issuerContact?: string;
  issuerEmail?: string;
  issuerInvoiceNumber?: string;
  issuerRepresentativeName?: string;
  issuerRepresentativeTitle?: string;
  issuerStampUrl?: string;
  bankNote?: string;
  bankName?: string;
  bankNumber?: string;
}

export interface BuildSourceSheetAuthUrlInput {
  appOrigin: string;
  spreadsheetTitle: string;
  sheetName?: string;
  historySheetName?: string;
  returnPath?: string;
  issuer?: KonoyubiIssuerSeed;
}

export function buildSourceSheetAuthUrl(input: BuildSourceSheetAuthUrlInput): string {
  const appOrigin = String(input.appOrigin || '').trim().replace(/\/+$/, '');
  if (!appOrigin) {
    throw new Error('appOrigin is required');
  }

  const spreadsheetTitle = String(input.spreadsheetTitle || '').trim();
  if (!spreadsheetTitle) {
    throw new Error('spreadsheetTitle is required');
  }

  const url = new URL('/api/google/auth', appOrigin);
  url.searchParams.set('spreadsheetTitle', spreadsheetTitle);
  url.searchParams.set('sheetName', String(input.sheetName || 'invoices').trim() || 'invoices');
  url.searchParams.set('historySheetName', String(input.historySheetName || 'history').trim() || 'history');
  url.searchParams.set('returnPath', String(input.returnPath || '/source-sheet').trim() || '/source-sheet');

  const issuer = input.issuer || {};
  appendIfPresent(url, 'shopId', issuer.shopId);
  appendIfPresent(url, 'issuerName', issuer.issuerName);
  appendIfPresent(url, 'issuerPostalCode', issuer.issuerPostalCode);
  appendIfPresent(url, 'issuerAddress', issuer.issuerAddress);
  appendIfPresent(url, 'issuerContact', issuer.issuerContact);
  appendIfPresent(url, 'issuerEmail', issuer.issuerEmail);
  appendIfPresent(url, 'issuerInvoiceNumber', issuer.issuerInvoiceNumber);
  appendIfPresent(url, 'issuerRepresentativeName', issuer.issuerRepresentativeName);
  appendIfPresent(url, 'issuerRepresentativeTitle', issuer.issuerRepresentativeTitle);
  appendIfPresent(url, 'issuerStampUrl', issuer.issuerStampUrl);
  appendIfPresent(url, 'bankNote', issuer.bankNote);
  appendIfPresent(url, 'bankName', issuer.bankName);
  appendIfPresent(url, 'bankNumber', issuer.bankNumber);

  return url.toString();
}

function appendIfPresent(url: URL, key: string, value?: string) {
  const normalized = String(value || '').trim();
  if (!normalized) {
    return;
  }
  url.searchParams.set(key, normalized);
}
