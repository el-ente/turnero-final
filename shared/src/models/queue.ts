export enum QueueType {
  NORMAL = "normal",
  PRIORITY = "priority",
}

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
  createdAt: Date;
  updatedAt: Date;
}
