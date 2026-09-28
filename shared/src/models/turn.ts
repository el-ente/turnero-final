/**
 * Turn lifecycle: waiting -> called -> attending -> finished, or cancelled.
 * On no-show, terminalService.handleNoShow requeues the turn (back to
 * waiting) while requeueCount < reenqueueConfig.maxAttempts, then marks it
 * NO_SHOW once exhausted — kept distinct from CANCELLED, which only
 * customer-initiated cancellation (turnService.cancelTurn) writes.
 * recallCount counts re-calls within the current call only (reset on
 * requeue), so re-calling never eats into the requeue budget.
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
  requeueCount?: number; // absent on turns created before this field existed
  createdAt: Date;
  calledAt?: Date;
  attendingAt?: Date;
  finishedAt?: Date;
  lastRequeueAt?: Date;
  lastRecallAt?: Date;
  terminalId?: string;
}
