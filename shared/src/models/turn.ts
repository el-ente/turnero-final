/**
 * Turn lifecycle: waiting -> called -> attending -> finished, or cancelled.
 * On no-show, terminalService.handleNoShow requeues the turn (back to
 * waiting) while reenqueueConfig.maxAttempts allows it, then marks it
 * NO_SHOW once exhausted — kept distinct from CANCELLED, which only
 * customer-initiated cancellation (turnService.cancelTurn) writes.
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
