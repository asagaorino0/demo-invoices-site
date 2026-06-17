const COMPANY_NAME_PLACEHOLDERS = new Set([
  '',
  '会社名',
  'companyname',
  'company name'
]);

export function normalizeCompanyName(input: {
  companyName?: string | null;
  invoiceRecipient?: string | null;
  fallbackCompanyName?: string | null;
}): string {
  const direct = cleanCompanyName(input.companyName);
  if (direct) return direct;

  const fallback = cleanCompanyName(input.fallbackCompanyName);
  if (fallback) return fallback;

  return cleanRecipientName(input.invoiceRecipient);
}

function cleanCompanyName(value: string | null | undefined): string {
  const text = String(value || '').trim();
  if (!text) return '';
  const normalized = text.toLowerCase();
  if (COMPANY_NAME_PLACEHOLDERS.has(normalized) || COMPANY_NAME_PLACEHOLDERS.has(text)) {
    return '';
  }
  return text;
}

function cleanRecipientName(value: string | null | undefined): string {
  return String(value || '')
    .replace(/\s*(御中|さま|様)\s*$/u, '')
    .trim();
}
