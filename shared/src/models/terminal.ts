export const ServingStrategy = {
  RATIO_BASED: "ratio_based",
  FIFO_ACROSS_QUEUES: "fifo_across_queues",
} as const;

export type ServingStrategy = typeof ServingStrategy[keyof typeof ServingStrategy];

export interface RatioBasedConfig {
  normalQueueRatio: number;
  priorityQueueRatio: number;
  normalCounterState?: number; // tracks how many normal turns served
  priorityCounterState?: number; // tracks how many priority turns served
}

export interface StrategyConfig {
  strategy: ServingStrategy;
  ratioBased?: RatioBasedConfig;
}

export const TerminalStatus = {
  AVAILABLE: "available",
  BUSY: "busy",
  OFFLINE: "offline",
} as const;

export type TerminalStatus = typeof TerminalStatus[keyof typeof TerminalStatus];

export interface Terminal {
  id: string;
  name: string;
  sectorIds: string[];
  activeQueueIds: string[];
  servingStrategy: ServingStrategy;
  strategyConfig: StrategyConfig;
  currentTurnId?: string;
  status: TerminalStatus;
  createdAt: Date;
  updatedAt: Date;
}
