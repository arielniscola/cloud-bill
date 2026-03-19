import api from './api';

export type ReminderUrgency = 'overdue' | 'critical' | 'warning';
export type ReminderType = 'invoice-due' | 'check-due' | 'ordenpedido-due';

export interface Reminder {
  id: string;
  type: ReminderType;
  title: string;
  message: string;
  href: string;
  dueDate: string;
  daysUntilDue: number;
  urgency: ReminderUrgency;
  amount: number;
}

export interface RemindersResult {
  reminders: Reminder[];
  counts: {
    overdue: number;
    critical: number;
    warning: number;
    total: number;
  };
}

export const remindersService = {
  async getReminders(days = 7): Promise<RemindersResult> {
    const res = await api.get<{ status: string; data: RemindersResult }>('/reminders', {
      params: { days },
    });
    return res.data.data;
  },
};
