export interface IvaItemRow {
  description: string;
  quantity: number;
  unitPrice: number;
  taxRate: number;
  subtotal: number;
  total: number;
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
  iva: number;
  total: number;
  cae: string;
  status: string;
  saleCondition: string;
  paymentTerms: string | null;
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
  iva: number;
  total: number;
  status: string;
  paymentStatus: string | null;
  saleCondition: string;
  items: IvaItemRow[];
}

export interface IvaPeriod {
  year: number;
  month: number;
}
