export interface ValidationResult {
  ok: boolean;
  message?: string;
}

export function validateProjectInput(input: {
  customerName: string;
  invoiceRecipient: string;
  companyName: string;
  defaultInvoiceDateMode?: string;
}): ValidationResult {
  if (!input.customerName.trim()) {
    return { ok: false, message: '利用者名を入力してください。' };
  }
  if (!input.companyName.trim()) {
    return { ok: false, message: '会社名を入力してください。' };
  }
  if (!input.invoiceRecipient.trim()) {
    return { ok: false, message: '請求先を入力してください。' };
  }
  if (
    input.defaultInvoiceDateMode &&
    !['visit', 'monthEnd', 'custom'].includes(input.defaultInvoiceDateMode)
  ) {
    return { ok: false, message: '請求日タイプを選択してください。' };
  }
  return { ok: true };
}

export function validateServiceLineInput(input: {
  serviceName: string;
  price: number;
  quantity: number;
  unit: string;
}): ValidationResult {
  if (!input.serviceName.trim()) {
    return { ok: false, message: 'サービス名を入力してください。' };
  }
  if (!Number.isFinite(input.price) || input.price < 0) {
    return { ok: false, message: '単価は 0 以上で入力してください。' };
  }
  if (!Number.isFinite(input.quantity) || input.quantity <= 0) {
    return { ok: false, message: '数量は 0 より大きい値を入力してください。' };
  }
  if (!input.unit.trim()) {
    return { ok: false, message: '単位を入力してください。' };
  }
  return { ok: true };
}
