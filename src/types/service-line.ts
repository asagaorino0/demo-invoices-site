export type CollectionStatus = 'uncollected' | 'collected';

export interface ExtraCharge {
  label: string;
  amount: number;
  quantity: number;
  unit: string;
}

export interface ServiceLine {
  id: string;
  projectId: string;
  reservationId: string;
  serviceDate: string | null;
  serviceName: string;
  staffName: string;
  price: number;
  quantity: number;
  unit: string;
  taxIncluded: boolean;
  extraCharges: ExtraCharge[];
  remarks: string;
  memo: string;
  visible: boolean;
  collectionStatus: CollectionStatus;
  collectedAt: string | null;
  receiptIssuedAt: string | null;
  invoiceCode: string;
  sortKey: number;
  createdAt: string;
  updatedAt: string;
}
