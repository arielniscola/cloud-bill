import { AfipConfig } from '../../domain/entities/AfipConfig';
import { InvoiceWithItems } from '../../domain/entities/Invoice';

// AFIP invoice type mapping
const INVOICE_TYPE_MAP: Record<string, number> = {
  FACTURA_A: 1,
  FACTURA_B: 6,
  FACTURA_C: 11,
  NOTA_DEBITO_A: 2,
  NOTA_DEBITO_B: 7,
  NOTA_DEBITO_C: 12,
  NOTA_CREDITO_A: 3,
  NOTA_CREDITO_B: 8,
  NOTA_CREDITO_C: 13,
};

// DocTipo mapping by tax condition
const DOC_TIPO_MAP: Record<string, number> = {
  RESPONSABLE_INSCRIPTO: 80,
  MONOTRIBUTISTA: 80,
  EXENTO: 80,
  CONSUMIDOR_FINAL: 99,
};

export interface EmitResult {
  cae: string;
  caeExpiry: Date;
  afipCbtNum: number;
  afipPtVenta: number;
}

export class AfipService {
  async emitInvoice(
    invoice: InvoiceWithItems & {
      customer: { taxId: string | null; taxCondition: string };
    },
    config: AfipConfig
  ): Promise<EmitResult> {
    // Dynamically import the AFIP SDK to avoid issues if not installed
    let Afip: any;
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const mod = require('@afipsdk/afip.js');
      Afip = mod.default || mod;
    } catch {
      throw new Error(
        'El paquete @afipsdk/afip.js no está instalado. Ejecute: npm install @afipsdk/afip.js'
      );
    }

    const cbte_tipo = INVOICE_TYPE_MAP[invoice.type];
    if (cbte_tipo === undefined) {
      throw new Error(`Tipo de comprobante no soportado: ${invoice.type}`);
    }

    const afip = new Afip({
      CUIT: config.cuit,
      cert: config.cert,
      key: config.privateKey,
      production: config.isProduction,
    });

    // Get last voucher to determine next number
    const lastVoucher = await afip.ElectronicBilling.getLastVoucher(config.salePoint, cbte_tipo);
    const cbteNro = (lastVoucher || 0) + 1;

    // Determine DocTipo and DocNro
    const taxCondition = invoice.customer.taxCondition;
    const docTipo = DOC_TIPO_MAP[taxCondition] ?? 99;
    const docNro = docTipo === 80 && invoice.customer.taxId
      ? invoice.customer.taxId.replace(/-/g, '')
      : '0';

    // Format date as YYYYMMDD
    const fecha = new Date(invoice.date);
    const cbteFch =
      fecha.getFullYear().toString() +
      String(fecha.getMonth() + 1).padStart(2, '0') +
      String(fecha.getDate()).padStart(2, '0');

    const impNeto = invoice.subtotal.toNumber();
    const impIva = invoice.taxAmount.toNumber();
    const impTotal = invoice.total.toNumber();

    const result = await afip.ElectronicBilling.createVoucher({
      CantReg: 1,
      PtoVta: config.salePoint,
      CbteTipo: cbte_tipo,
      Concepto: 1, // Productos
      DocTipo: docTipo,
      DocNro: docNro,
      CbteDesde: cbteNro,
      CbteHasta: cbteNro,
      CbteFch: cbteFch,
      ImpTotal: impTotal,
      ImpTotConc: 0,
      ImpNeto: impNeto,
      ImpOpEx: 0,
      ImpIVA: impIva,
      ImpTrib: 0,
      MonId: invoice.currency === 'USD' ? 'DOL' : 'PES',
      MonCotiz: invoice.currency === 'USD' ? invoice.exchangeRate.toNumber() : 1,
      Iva: [
        {
          Id: 5, // 21%
          BaseImp: impNeto,
          Importe: impIva,
        },
      ],
    });

    const caeExpiry = this.parseAfipDate(result.CAEFchVto);

    return {
      cae: result.CAE,
      caeExpiry,
      afipCbtNum: cbteNro,
      afipPtVenta: config.salePoint,
    };
  }

  async testConnection(config: AfipConfig): Promise<{ ok: boolean; message: string }> {
    let Afip: any;
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const mod = require('@afipsdk/afip.js');
      Afip = mod.default || mod;
    } catch {
      throw new Error(
        'El paquete @afipsdk/afip.js no está instalado. Ejecute: npm install @afipsdk/afip.js'
      );
    }

    const afip = new Afip({
      CUIT: config.cuit,
      cert: config.cert,
      key: config.privateKey,
      production: config.isProduction,
    });

    const serverStatus = await afip.ElectronicBilling.getServerStatus();
    const ok =
      serverStatus?.AppServer === 'OK' &&
      serverStatus?.DbServer === 'OK' &&
      serverStatus?.AuthServer === 'OK';

    return { ok, message: ok ? 'Conexión exitosa con ARCA' : 'Servicio ARCA no disponible' };
  }

  private parseAfipDate(dateStr: string): Date {
    // AFIP returns dates as YYYYMMDD
    const y = parseInt(dateStr.substring(0, 4), 10);
    const m = parseInt(dateStr.substring(4, 6), 10) - 1;
    const d = parseInt(dateStr.substring(6, 8), 10);
    return new Date(y, m, d);
  }
}

export const afipService = new AfipService();
