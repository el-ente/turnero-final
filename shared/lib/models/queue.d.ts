export declare const QueueType: {
    readonly NORMAL: "normal";
    readonly PRIORITY: "priority";
};
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
    servedBy: string[];
    createdAt: Date;
    updatedAt: Date;
}
//# sourceMappingURL=queue.d.ts.map