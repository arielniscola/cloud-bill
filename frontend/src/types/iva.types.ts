export interface IvaItemRow {
  description: string;
  quantity: number;
  unitPrice: number;
  taxRate: number;
  subtotal: number;
  total: number;
  superRubro?: string;
}

export interface IvaAlicuota {
  rate: number;
  neto: number;
  iva: number;
}

export interface IvaVentasRow {
  invoiceId: string;
  fecha: string;
  numero: string;
  afipCbtNum: number | string;
  tipo: string;
  cliente: string;
  cuitCliente: string;
  condicionIva: string;
  neto: number;
  exento: number;
  iva: number;
  total: number;
  cae: string;
  status: string;
  saleCondition: string;
  paymentTerms: string | null;
  alicuotas: IvaAlicuota[];
  items: IvaItemRow[];
}

export interface IvaComprasRow {
  purchaseId: string;
  fecha: string;
  numero: string;
  tipo: string;
  proveedor: string;
  cuitProveedor: string;
  neto: number;
  exento: number;
  iva: number;
  percepcionIva: number;
  percepcionIIBB: number;
  otrosTributos: number;
  total: number;
  status: string;
  paymentStatus: string | null;
  saleCondition: string;
  alicuotas: IvaAlicuota[];
  items: IvaItemRow[];
}

export interface IvaPeriod {
  year: number;
  month: number;
}
