export enum ServingStrategy {
  RATIO_BASED = "ratio_based",
  FIFO_ACROSS_QUEUES = "fifo_across_queues",
}

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

export enum TerminalStatus {
  AVAILABLE = "available",
  BUSY = "busy",
  OFFLINE = "offline",
}

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
