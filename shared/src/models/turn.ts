/**
 * Turn lifecycle: waiting -> called -> attending -> finished, or cancelled.
 * On no-show, terminalService.handleNoShow requeues the turn (back to
 * waiting) or cancels it once reenqueueConfig.maxAttempts is exhausted —
 * it never sets NO_SHOW. NO_SHOW is currently unused; no code path writes it.
 */
export const TurnStatus = {
  WAITING: "waiting",
  CALLED: "called",
  ATTENDING: "attending",
  FINISHED: "finished",
  NO_SHOW: "no_show",
  CANCELLED: "cancelled",
} as const;

export type TurnStatus = typeof TurnStatus[keyof typeof TurnStatus];

export type Channel = "totem" | "whatsapp" | "mobile";

export interface Turn {
  id: string;
  memberNumber: number;
  queueId: string;
  queuedAt: Date;
  status: TurnStatus;
  channel: Channel;
  recallCount: number;
  createdAt: Date;
  calledAt?: Date;
  attendingAt?: Date;
  finishedAt?: Date;
  lastRequeueAt?: Date;
  lastRecallAt?: Date;
  terminalId?: string;
}
