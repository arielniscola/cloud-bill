import * as forge from 'node-forge';
import * as soap from 'soap';
import { AfipConfig } from '../../domain/entities/AfipConfig';
import { InvoiceWithItems } from '../../domain/entities/Invoice';

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

const DOC_TIPO_MAP: Record<string, number> = {
  RESPONSABLE_INSCRIPTO: 80,
  MONOTRIBUTISTA: 80,
  EXENTO: 80,
  CONSUMIDOR_FINAL: 99,
};

const WSAA_WSDL = {
  prod: 'https://wsaa.afip.gov.ar/ws/services/LoginCms?WSDL',
  test: 'https://wsaahomo.afip.gov.ar/ws/services/LoginCms?WSDL',
};

const WSFE_WSDL = {
  prod: 'https://servicios1.afip.gov.ar/wsfev1/service.asmx?WSDL',
  test: 'https://wswhomo.afip.gov.ar/wsfev1/service.asmx?WSDL',
};

export interface EmitResult {
  cae: string;
  caeExpiry: Date;
  afipCbtNum: number;
  afipPtVenta: number;
}

interface TokenAuth {
  token: string;
  sign: string;
  expiresAt: Date;
}

// In-memory TA cache — key: `${cuit}-${env}`
const taCache = new Map<string, TokenAuth>();

export class AfipService {
  /** Build the TRA (Ticket de Requerimiento de Acceso) XML */
  private buildTRA(service: string): string {
    const now = new Date();
    const gen = new Date(now.getTime() - 10 * 60 * 1000);
    const exp = new Date(now.getTime() + 10 * 60 * 1000);
    // AFIP accepts ISO 8601 — use UTC (Z) to avoid timezone conversion bugs
    const fmt = (d: Date) => d.toISOString().replace(/\.\d{3}Z$/, 'Z');
    return `<?xml version="1.0" encoding="UTF-8"?><loginTicketRequest version="1.0"><header><uniqueId>${Math.floor(now.getTime() / 1000)}</uniqueId><generationTime>${fmt(gen)}</generationTime><expirationTime>${fmt(exp)}</expirationTime></header><service>${service}</service></loginTicketRequest>`;
  }

  /** Sign TRA with PKCS7 (CMS) using the private key + certificate */
  private signTRA(traXml: string, certPem: string, keyPem: string): string {
    const cert = forge.pki.certificateFromPem(certPem);
    const key = forge.pki.privateKeyFromPem(keyPem);
    const p7 = forge.pkcs7.createSignedData();
    p7.content = forge.util.createBuffer(traXml, 'utf8');
    p7.addCertificate(cert);
    p7.addSigner({
      key,
      certificate: cert,
      digestAlgorithm: forge.pki.oids.sha256,
      authenticatedAttributes: [
        { type: forge.pki.oids.contentType, value: forge.pki.oids.data },
        { type: forge.pki.oids.signingTime, value: new Date() as unknown as string },
        { type: forge.pki.oids.messageDigest },
      ],
    });
    p7.sign();
    const der = forge.asn1.toDer(p7.toAsn1()).getBytes();
    return forge.util.encode64(der);
  }

  /** Parse the loginTicketResponse XML from WSAA */
  private parseTA(xml: string): TokenAuth {
    const token = xml.match(/<token>([\s\S]*?)<\/token>/)?.[1] ?? '';
    const sign = xml.match(/<sign>([\s\S]*?)<\/sign>/)?.[1] ?? '';
    const expStr = xml.match(/<expirationTime>([\s\S]*?)<\/expirationTime>/)?.[1] ?? '';
    if (!token || !sign) throw new Error('WSAA: respuesta inválida — token/sign no encontrados');
    return { token, sign, expiresAt: new Date(expStr) };
  }

  /** Get (or refresh) the Ticket de Acceso from WSAA */
  private async getTA(config: AfipConfig): Promise<TokenAuth> {
    const env = config.isProduction ? 'prod' : 'test';
    const cacheKey = `${config.cuit}-${env}`;
    const cached = taCache.get(cacheKey);
    // Reuse if still valid (with 5-min buffer)
    if (cached && cached.expiresAt.getTime() - Date.now() > 5 * 60 * 1000) return cached;

    const tra = this.buildTRA('wsfe');
    const cms = this.signTRA(tra, config.cert, config.privateKey);

    const wsaaClient = await soap.createClientAsync(WSAA_WSDL[env]);
    let loginResult: any;
    try {
      [loginResult] = await (wsaaClient as any).loginCmsAsync({ in0: cms });
    } catch (err: any) {
      throw new Error(`WSAA error: ${err.message ?? err}`);
    }

    const ta = this.parseTA(loginResult?.loginCmsReturn ?? '');
    taCache.set(cacheKey, ta);
    return ta;
  }

  /** Test server availability (FEDummy) + WSAA authentication */
  async testConnection(config: AfipConfig): Promise<{ ok: boolean; message: string }> {
    try {
      const env = config.isProduction ? 'prod' : 'test';
      // 1. Test WSFE server status (no auth needed)
      const wsfeClient = await soap.createClientAsync(WSFE_WSDL[env]);
      const [dummyRes] = await (wsfeClient as any).FEDummyAsync({});
      const d = dummyRes?.FEDummyResult;
      if (!(d?.AppServer === 'OK' && d?.DbServer === 'OK' && d?.AuthServer === 'OK')) {
        return {
          ok: false,
          message: `Servidor ARCA no disponible — App:${d?.AppServer} DB:${d?.DbServer} Auth:${d?.AuthServer}`,
        };
      }
      // 2. Test WSAA auth (cert + key)
      await this.getTA(config);
      return { ok: true, message: 'Conexión y autenticación con ARCA exitosas' };
    } catch (err: any) {
      return { ok: false, message: err.message ?? 'Error al conectar con ARCA' };
    }
  }

  /** Emit invoice to AFIP and return CAE */
  async emitInvoice(
    invoice: InvoiceWithItems & { customer: { taxId: string | null; taxCondition: string } },
    config: AfipConfig
  ): Promise<EmitResult> {
    const cbteTipo = INVOICE_TYPE_MAP[invoice.type];
    if (cbteTipo === undefined) throw new Error(`Tipo de comprobante no soportado: ${invoice.type}`);

    const ta = await this.getTA(config);
    const env = config.isProduction ? 'prod' : 'test';
    const wsfeClient = await soap.createClientAsync(WSFE_WSDL[env]);
    const auth = { Token: ta.token, Sign: ta.sign, Cuit: config.cuit };

    // Get last authorized voucher number to compute the next
    const [lastRes] = await (wsfeClient as any).FECompUltimoAutorizadoAsync({
      Auth: auth,
      PtoVta: config.salePoint,
      CbteTipo: cbteTipo,
    });
    const lastNum: number = lastRes?.FECompUltimoAutorizadoResult?.CbteNro ?? 0;
    const cbteNro = lastNum + 1;

    const docTipo = DOC_TIPO_MAP[invoice.customer.taxCondition] ?? 99;
    const docNro =
      docTipo === 80 && invoice.customer.taxId
        ? invoice.customer.taxId.replace(/-/g, '')
        : '0';

    const fecha = new Date(invoice.date);
    const cbteFch =
      fecha.getFullYear().toString() +
      String(fecha.getMonth() + 1).padStart(2, '0') +
      String(fecha.getDate()).padStart(2, '0');

    const impNeto = invoice.subtotal.toNumber();
    const impIva = invoice.taxAmount.toNumber();
    const impTotal = invoice.total.toNumber();

    // Facturas C and zero-IVA invoices don't need the IVA array
    const needsIvaArray = !invoice.type.endsWith('_C') && impIva > 0;

    const detRequest: Record<string, unknown> = {
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
    };

    if (needsIvaArray) {
      detRequest.Iva = {
        AlicIva: { Id: 5, BaseImp: impNeto, Importe: impIva }, // 21%
      };
    }

    const [caeRes] = await (wsfeClient as any).FECAESolicitarAsync({
      Auth: auth,
      FeCAEReq: {
        FeCabReq: { CantReg: 1, PtoVta: config.salePoint, CbteTipo: cbteTipo },
        FeDetReq: { FECAEDetRequest: detRequest },
      },
    });

    const fResult = caeRes?.FECAESolicitarResult;
    const det = fResult?.FeDetResp?.FECAEDetResponse;

    // Surface any hard errors
    const errors = fResult?.Errors?.Err;
    if (errors) {
      const errList = Array.isArray(errors) ? errors : [errors];
      throw new Error(errList.map((e: any) => `[${e.Code}] ${e.Msg}`).join('; '));
    }

    if (!det?.CAE || det.Resultado !== 'A') {
      const obs = det?.Observaciones?.Obs;
      const obsList = obs ? (Array.isArray(obs) ? obs : [obs]) : [];
      const obsMsg = obsList.map((o: any) => `[${o.Code}] ${o.Msg}`).join('; ');
      throw new Error(
        `CAE rechazado por AFIP. Resultado: ${det?.Resultado ?? 'sin respuesta'}.${obsMsg ? ' ' + obsMsg : ''}`
      );
    }

    return {
      cae: det.CAE,
      caeExpiry: this.parseAfipDate(det.CAEFchVto),
      afipCbtNum: cbteNro,
      afipPtVenta: config.salePoint,
    };
  }

  private parseAfipDate(dateStr: string): Date {
    const y = parseInt(dateStr.substring(0, 4), 10);
    const m = parseInt(dateStr.substring(4, 6), 10) - 1;
    const d = parseInt(dateStr.substring(6, 8), 10);
    return new Date(y, m, d);
  }
}

export const afipService = new AfipService();
