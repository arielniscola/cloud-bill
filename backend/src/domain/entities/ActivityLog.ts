export type ActivityAction = 'CREATE' | 'UPDATE' | 'DELETE' | 'PAYMENT' | 'CANCEL' | 'TRANSFER';

export interface ActivityLog {
  id: string;
  userId: string;
  action: ActivityAction;
  entity: string;
  entityId: string;
  description: string;
  metadata?: Record<string, unknown> | null;
  createdAt: Date;
  user?: {
    id: string;
    name: string;
    email: string;
  };
}

export interface CreateActivityLogInput {
  userId: string;
  action: ActivityAction;
  entity: string;
  entityId: string;
  description: string;
  metadata?: Record<string, unknown>;
  companyId?: string; // used to check activity_log feature — if plan doesn't include it, skip write
}
