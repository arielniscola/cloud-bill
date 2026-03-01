import { z } from 'zod';

export const updateAppSettingsSchema = z.object({
  defaultBudgetCashRegisterId:  z.string().uuid().optional().nullable(),
  defaultInvoiceCashRegisterId: z.string().uuid().optional().nullable(),
  deadStockDays:                z.number().int().min(1).max(3650).optional(),
  safetyStockDays:              z.number().int().min(1).max(365).optional(),
});

export type UpdateAppSettingsDTO = z.infer<typeof updateAppSettingsSchema>;
