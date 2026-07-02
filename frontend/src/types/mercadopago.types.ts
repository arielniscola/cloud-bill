export interface MpStatus {
  configured: boolean;
  mode: 'test' | 'production';
  publicKey: string | null;
}

export interface MpPreferenceResult {
  preferenceId: string;
  payUrl: string;
  initPoint: string;
  sandboxInitPoint: string;
  amount: number;
  title: string;
  mode: 'test' | 'production';
}

export interface MpBalance {
  availableBalance: number;
  unavailableBalance: number;
  totalBalance: number;
  currencyId: string;
}

export interface MpMovement {
  id: number;
  type: string;
  date: string;
  amount: number;
  currencyId: string;
  description: string | null;
  sourceId: number | null;
  sourceType: string | null;
  balance: number | null;
  linked: boolean;
}

export interface MpMovementsResult {
  results: MpMovement[];
  total: number;
}

export interface MpQrResult {
  /** String EMV a renderizar como QR (NO es una URL) */
  qrData: string;
  inStoreOrderId: string | null;
  amount: number;
  title: string;
  mode: 'test' | 'production';
}

export interface CreateMpPreferenceDTO {
  invoiceId?:      string;
  budgetId?:       string;
  ordenPedidoId?:  string;
  cashRegisterId?: string | null;
  notes?:          string | null;
}

export interface LinkMpPaymentDTO {
  mpPaymentId:    string;
  invoiceId?:     string;
  budgetId?:      string;
  ordenPedidoId?: string;
  cashRegisterId?: string | null;
  notes?:         string | null;
}
