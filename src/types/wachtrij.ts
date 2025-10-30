export interface WebserviceLog {
  ID: number;
  tijdstip: Date;
  method: string | null;
  bikeparkID: string | null;
  logtekst: string;
  logtekst2: string | null; // JSON string
  ms: number | null;
}

export interface WebserviceLogResponse {
  data: WebserviceLog[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
  availableMethods: string[]; // List of unique methods for filter
}

export interface WachtrijBetalingen {
  ID: number;
  bikeparkID: string;
  passID: string;
  transactionDate: Date;
  amount: number | string; // Prisma Decimal type
  processed: boolean; // Boolean: true = processed, false = pending
  processDate: Date | null;
  error: string | null;
  dateCreated: Date;
}

export interface WachtrijPasids {
  ID: number;
  bikeparkID: string;
  passID: string;
  barcode: string;
  RFID: string;
  transactionDate: Date | null;
  processed: boolean; // Boolean: true = processed, false = pending
  processDate: Date | null;
  error: string | null;
  DateCreated: Date;
}

export interface WachtrijTransacties {
  ID: number;
  bikeparkID: string;
  sectionID: string;
  passID: string;
  type: string;
  transactionDate: Date | null;
  processed: boolean; // Boolean: true = processed, false = pending
  processDate: Date | null;
  error: string | null;
  dateCreated: Date;
}

export interface WachtrijSync {
  ID: number;
  bikeparkID: string;
  sectionID: string;
  transactionDate: Date | null;
  processed: number; // Int: 0=pending, 1=success, 2=error, 8/9=processing
  processDate: Date | null;
  error: string | null;
  dateCreated: Date;
}

export interface WachtrijSummary {
  total: number;
  pending: number;
  processing: number;
  success: number;
  error: number;
}

export type WachtrijRecord = WachtrijBetalingen | WachtrijPasids | WachtrijTransacties | WachtrijSync;

export interface WachtrijResponse<T = WachtrijRecord> {
  data: T[];
  summary: WachtrijSummary;
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}
