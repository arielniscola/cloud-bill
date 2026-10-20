export type DefaultInvoiceType = 'AUTO' | 'FACTURA_A' | 'FACTURA_B' | 'FACTURA_C';
/** Copias del remito A4: dos por hoja, una hoja por copia o una sola copia. */
export type RemitoCopies = 'TWO_PER_PAGE' | 'ONE_PER_PAGE' | 'SINGLE';

export interface AppSettings {
  id: string;
  defaultInvoiceCashRegisterId: string | null;
  defaultBudgetCashRegisterId?: string | null;
  deadStockDays:                number;
  safetyStockDays:              number;
  stalePriceWarnDays1:          number;
  stalePriceWarnDays2:          number;
  companyTaxCondition:          string;
  printFormat:                  string;
  printFormatInvoice?:          string;
  printFormatBudget?:           string;
  printFormatOrdenPedido?:      string;
  printFormatRemito?:           string;
  printFormatRecibo?:           string;
  printFormatCashMovement?:     string;
  smtpHost:                     string | null;
  smtpPort:                     number;
  smtpUser:                     string | null;
  smtpPassSet?:                 boolean;  // la contraseña no viaja al cliente
  smtpFrom:                     string | null;
  smtpSecure:                   boolean;
  mpAccessTokenSet?:            boolean;
  mpPublicKey:                  string | null;
  mpWebhookSecretSet?:          boolean;
  mpMode:                       'test' | 'production';
  mpPosId:                      string | null;
  defaultRegisterPaymentInvoice?:     boolean;
  defaultRegisterPaymentOrdenPedido?: boolean;
  timeSurchargeEnabled?:             boolean;
  timeSurchargeFrom?:                string;
  timeSurchargeTo?:                  string;
  timeSurchargePct?:                 number;
  defaultInvoiceType?:               DefaultInvoiceType;
  printWebsite?:                     string | null;
  printEstablishment?:               string | null;
  remitoCai?:                        string | null;
  remitoCaiExpiry?:                  string | null;
  remitoCopies?:                     RemitoCopies;
  defaultInvoiceCashRegister?:  { id: string; name: string } | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface UpdateAppSettingsDTO {
  defaultInvoiceCashRegisterId?: string | null;
  deadStockDays?:                number;
  safetyStockDays?:              number;
  stalePriceWarnDays1?:          number;
  stalePriceWarnDays2?:          number;
  companyTaxCondition?:          string;
  printFormat?:                  string;
  printFormatInvoice?:           string;
  printFormatBudget?:            string;
  printFormatOrdenPedido?:       string;
  printFormatRemito?:            string;
  printFormatRecibo?:            string;
  printFormatCashMovement?:      string;
  smtpHost?:                     string | null;
  smtpPort?:                     number;
  smtpUser?:                     string | null;
  smtpPass?:                     string | null;
  smtpFrom?:                     string | null;
  smtpSecure?:                   boolean;
  mpAccessToken?:                string | null;
  mpPublicKey?:                  string | null;
  mpWebhookSecret?:              string | null;
  mpMode?:                       'test' | 'production';
  mpPosId?:                      string | null;
  defaultRegisterPaymentInvoice?:     boolean;
  defaultRegisterPaymentOrdenPedido?: boolean;
  timeSurchargeEnabled?:             boolean;
  timeSurchargeFrom?:                string;
  timeSurchargeTo?:                  string;
  timeSurchargePct?:                 number;
  defaultInvoiceType?:               DefaultInvoiceType;
  printWebsite?:                     string | null;
  printEstablishment?:               string | null;
  remitoCai?:                        string | null;
  remitoCaiExpiry?:                  string | null;
  remitoCopies?:                     RemitoCopies;
}
