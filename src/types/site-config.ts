export interface SiteConfig {
  siteTitle: string;
  headerNote: string;
  heroDescription: string;
  invoiceSheetCsvUrl: string;
  localInvoiceCsvUrl: string;
  fallbackInvoicesUrl: string;
  issuerSheetName: string;
  issuerName: string;
  issuerAddress: string;
  issuerContact: string;
  issuerPostalCode: string;
  issuerEmail: string;
  issuerInvoiceNumber: string;
  issuerRepresentativeName: string;
  issuerRepresentativeTitle: string;
  issuerStampUrl: string;
  bankNote: string;
  defaultTaxRate: number;
  currency: string;
}
