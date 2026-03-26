export declare enum QueueType {
    NORMAL = "normal",
    PRIORITY = "priority"
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
    servedBy: string[];
    createdAt: Date;
    updatedAt: Date;
}
//# sourceMappingURL=queue.d.ts.map