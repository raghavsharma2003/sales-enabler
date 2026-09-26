export type TaskState = 'pending' | 'accepted' | 'rejected' | 'blocked' | 'uncertain' | 'interrupted';
export type ScheduleState = 'enabled' | 'paused' | 'cancelled' | 'completed' | 'attention';
export type AutomationTask = { contactId: string; requestId: string; state: TaskState; reason?: string; receiptId?: string };
export type AutomationSchedule = {
  runId: string; name: string; connectionId: string; authorizedBy: string; authorizedAt: string;
  scheduledAt: string; timezone: string; runDigest: string; tasks: AutomationTask[];
  claim?: { token: string; contactId: string; phase: 'preparing' | 'egress'; expiresAt: string };
  history: { at: string; event: string }[];
};
export type ScheduleView = { id: string; status: ScheduleState; revision: number; data: AutomationSchedule; overdue: boolean; canManage: boolean };
export type AutomationPreview = {
  runId: string; name: string; ready: boolean; blockers: string[]; reviewToken: string;
  recipients: { contactId: string; name: string; email: string; eligible: boolean; reason?: string }[];
  subject: string; message: string;
};
export type AutomationDashboard = {
  canManage: boolean;
  schedules: ScheduleView[];
  runs: { id: string; name: string; status: string }[];
  worker: { running: boolean; lastSeenAt?: string; explanation: string };
};
