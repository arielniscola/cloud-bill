import { z } from 'zod';

export const updateAppSettingsSchema = z.object({
  defaultBudgetCashRegisterId:  z.string().uuid().optional().nullable(),
  defaultInvoiceCashRegisterId: z.string().uuid().optional().nullable(),
  deadStockDays:                z.number().int().min(1).max(3650).optional(),
  safetyStockDays:              z.number().int().min(1).max(365).optional(),
  stalePriceWarnDays1:          z.number().int().min(1).max(365).optional(),
  stalePriceWarnDays2:          z.number().int().min(1).max(365).optional(),
  companyTaxCondition:          z.enum(['RESPONSABLE_INSCRIPTO', 'MONOTRIBUTISTA', 'EXENTO', 'CONSUMIDOR_FINAL']).optional(),
  printFormat:                  z.enum(['A4', 'THERMAL_80MM']).optional(),
  smtpHost:                     z.string().optional().nullable(),
  smtpPort:                     z.number().int().min(1).max(65535).optional(),
  smtpUser:                     z.string().optional().nullable(),
  smtpPass:                     z.string().optional().nullable(),
  smtpFrom:                     z.string().optional().nullable(),
  smtpSecure:                   z.boolean().optional(),
});

export type UpdateAppSettingsDTO = z.infer<typeof updateAppSettingsSchema>;
