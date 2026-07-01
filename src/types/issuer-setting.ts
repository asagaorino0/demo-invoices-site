export const DEFAULT_ISSUER_SETTING_KEY = 'default';

export interface IssuerSetting {
  settingKey: string;
  issuerName: string;
  issuerPostalCode: string;
  issuerAddress: string;
  issuerContact: string;
  issuerEmail: string;
  issuerInvoiceNumber: string;
  issuerRepresentativeName: string;
  issuerRepresentativeTitle: string;
  issuerStampUrl: string;
  bankNote: string;
  createdAt: string;
  updatedAt: string;
}
