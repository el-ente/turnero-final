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
  memberId: string;
  queueId: string;
  originalTurnNumber: number;
  currentTurnNumber: number;
  status: TurnStatus;
  channel: Channel;
  recallCount: number;
  createdAt: Date;
  calledAt?: Date;
  attendingAt?: Date;
  finishedAt?: Date;
  lastRequeueAt?: Date;
  terminalId?: string;
}
