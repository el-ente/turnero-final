export declare enum ServingStrategy {
    RATIO_BASED = "ratio_based",
    FIFO_ACROSS_QUEUES = "fifo_across_queues"
}
export interface RatioBasedConfig {
    normalQueueRatio: number;
    priorityQueueRatio: number;
    normalCounterState?: number;
    priorityCounterState?: number;
}
export interface StrategyConfig {
    strategy: ServingStrategy;
    ratioBased?: RatioBasedConfig;
}
export declare enum TerminalStatus {
    AVAILABLE = "available",
    BUSY = "busy",
    OFFLINE = "offline"
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
//# sourceMappingURL=terminal.d.ts.map