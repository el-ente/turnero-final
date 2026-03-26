export declare const ServingStrategy: {
    readonly RATIO_BASED: "ratio_based";
    readonly FIFO_ACROSS_QUEUES: "fifo_across_queues";
};
export type ServingStrategy = typeof ServingStrategy[keyof typeof ServingStrategy];
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
export declare const TerminalStatus: {
    readonly AVAILABLE: "available";
    readonly BUSY: "busy";
    readonly OFFLINE: "offline";
};
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
//# sourceMappingURL=terminal.d.ts.map