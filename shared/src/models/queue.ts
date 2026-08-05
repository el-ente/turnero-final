export const QueueType = {
  NORMAL: "normal",
  PRIORITY: "priority",
} as const;

export type QueueType = typeof QueueType[keyof typeof QueueType];

export interface ReenqueueConfig {
  enabled: boolean;
  maxAttempts: number;
  positionsBack: number;
}

export interface Queue {
  id: string;
  sectorId: string;
  name: string;
  type: QueueType;
  reenqueueConfig: ReenqueueConfig;
  priorityWeight?: number;
  servedBy: string[]; // terminal IDs
  active: boolean; // false = closed to new turns, without losing config
  createdAt: Date;
  updatedAt: Date;
}
