export type ActivityAction = 'CREATE' | 'UPDATE' | 'DELETE' | 'PAYMENT' | 'CANCEL' | 'TRANSFER';

export interface ActivityLog {
  id: string;
  userId: string;
  action: ActivityAction;
  entity: string;
  entityId: string;
  description: string;
  metadata?: Record<string, unknown> | null;
  createdAt: string;
  user?: {
    id: string;
    name: string;
    email: string;
  };
}

export interface ActivityLogFilters {
  page?: number;
  limit?: number;
  userId?: string;
  action?: ActivityAction;
  entity?: string;
  dateFrom?: string;
  dateTo?: string;
}
