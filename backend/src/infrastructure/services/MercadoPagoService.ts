import { MercadoPagoConfig, Preference, Payment } from 'mercadopago';
import axios from 'axios';

export interface MpPreferenceInput {
  externalReference: string;
  title: string;
  amount: number;
  notificationUrl: string;
  backUrls?: { success?: string; failure?: string; pending?: string };
}

export interface MpPreferenceResult {
  id: string;
  initPoint: string;
  sandboxInitPoint: string;
}

export interface MpPaymentData {
  id: number;
  status: string; // approved | pending | in_process | rejected | cancelled | refunded | charged_back
  statusDetail: string;
  externalReference: string | null;
  preferenceId: string | null;
  amount: number;
  netAmount: number;
  feesAmount: number;
  payerEmail: string | null;
  paymentMethodId: string | null;
  paymentTypeId: string | null;
  dateApproved: string | null;
  dateCreated: string;
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
}

export interface MpBalance {
  availableBalance: number;
  unavailableBalance: number;
  totalBalance: number;
  currencyId: string;
}

const MP_API = 'https://api.mercadopago.com';

export class MercadoPagoService {
  private client: MercadoPagoConfig;
  private accessToken: string;

  constructor(accessToken: string) {
    this.accessToken = accessToken;
    this.client = new MercadoPagoConfig({ accessToken });
  }

  async createPreference(input: MpPreferenceInput): Promise<MpPreferenceResult> {
    const preference = new Preference(this.client);
    const result = await preference.create({
      body: {
        items: [
          {
            id:         input.externalReference,
            title:      input.title,
            quantity:   1,
            unit_price: input.amount,
            currency_id: 'ARS',
          },
        ],
        external_reference: input.externalReference,
        notification_url:   input.notificationUrl,
        back_urls: input.backUrls as any,
        auto_return: input.backUrls?.success ? 'approved' : undefined,
        expires: true,
        expiration_date_from: new Date().toISOString(),
        expiration_date_to:   new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), // 7 days
      },
    });

    return {
      id:              result.id!,
      initPoint:       result.init_point!,
      sandboxInitPoint: result.sandbox_init_point!,
    };
  }

  async getPayment(paymentId: string | number): Promise<MpPaymentData> {
    const payment = new Payment(this.client);
    const result = await payment.get({ id: String(paymentId) });

    return {
      id:               result.id!,
      status:           result.status!,
      statusDetail:     (result as any).status_detail ?? '',
      externalReference: (result as any).external_reference ?? null,
      preferenceId:     (result as any).preference_id ?? null,
      amount:           Number((result as any).transaction_amount ?? 0),
      netAmount:        Number((result as any).transaction_net_amount ?? (result as any).transaction_amount ?? 0),
      feesAmount:       Number((result as any).fee_details?.reduce((s: number, f: any) => s + Number(f.amount ?? 0), 0) ?? 0),
      payerEmail:       (result as any).payer?.email ?? null,
      paymentMethodId:  (result as any).payment_method_id ?? null,
      paymentTypeId:    (result as any).payment_type_id ?? null,
      dateApproved:     (result as any).date_approved ?? null,
      dateCreated:      (result as any).date_created ?? new Date().toISOString(),
    };
  }

  async getBalance(): Promise<MpBalance | null> {
    // /v1/account/balance requires OAuth scopes not available with standard APP_USR credentials.
    return null;
  }

  async getMovements(options: {
    from?: string;
    to?: string;
    limit?: number;
    offset?: number;
  } = {}): Promise<{ results: MpMovement[]; total: number }> {
    const payment = new Payment(this.client);

    const filters: Record<string, any> = {
      sort:     'date_created',
      criteria: 'desc',
      limit:    options.limit  ?? 20,
      offset:   options.offset ?? 0,
    };
    if (options.from || options.to) {
      filters['range']      = 'date_created';
      if (options.from) filters['begin_date'] = options.from;
      if (options.to)   filters['end_date']   = options.to;
    }

    const res = await payment.search({ options: filters });

    const results: MpMovement[] = ((res as any).results ?? []).map((m: any) => ({
      id:          Number(m.id),
      type:        m.payment_type_id ?? m.operation_type ?? 'payment',
      date:        m.date_approved ?? m.date_created ?? '',
      amount:      Number(m.transaction_amount ?? 0),
      currencyId:  m.currency_id ?? 'ARS',
      description: m.description ?? m.reason ?? null,
      sourceId:    m.id ?? null,
      sourceType:  m.status ?? null,
      balance:     null,
    }));

    return { results, total: (res as any).paging?.total ?? results.length };
  }

  /** Verify webhook signature from MP (x-signature header) */
  static verifySignature(
    xSignature: string,
    xRequestId: string,
    dataId: string,
    secret: string
  ): boolean {
    try {
      const crypto = require('crypto');
      const manifest = `id:${dataId};request-id:${xRequestId};`;
      const parts = xSignature.split(',');
      const tsEntry = parts.find((p) => p.startsWith('ts='));
      const v1Entry = parts.find((p) => p.startsWith('v1='));
      if (!tsEntry || !v1Entry) return false;
      const ts = tsEntry.split('=')[1];
      const v1 = v1Entry.split('=')[1];
      const signedManifest = `${ts}${manifest}`;
      const hmac = crypto.createHmac('sha256', secret).update(signedManifest).digest('hex');
      return hmac === v1;
    } catch {
      return false;
    }
  }
}
