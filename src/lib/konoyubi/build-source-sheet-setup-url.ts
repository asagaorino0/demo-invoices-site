import type { KonoyubiIssuerSeed } from './build-source-sheet-auth-url';

export interface BuildSourceSheetSetupUrlInput {
  appOrigin: string;
  returnTo?: string;
  mode?: 'existing' | 'create';
  issuer?: KonoyubiIssuerSeed;
}

export function buildSourceSheetSetupUrl(input: BuildSourceSheetSetupUrlInput): string {
  const appOrigin = String(input.appOrigin || '').trim().replace(/\/+$/, '');
  if (!appOrigin) {
    throw new Error('appOrigin is required');
  }

  const url = new URL('/source-sheet', appOrigin);
  if (input.returnTo) {
    url.searchParams.set('returnTo', String(input.returnTo).trim());
  }
  if (input.mode) {
    url.searchParams.set('mode', input.mode);
  }

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
