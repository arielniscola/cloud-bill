export interface IvaVentasRow {
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
}

export interface IvaComprasRow {
  fecha: string;
  numero: string;
  tipo: string;
  proveedor: string;
  cuitProveedor: string;
  neto: number;
  iva: number;
  total: number;
}

export interface IvaPeriod {
  year: number;
  month: number;
}
