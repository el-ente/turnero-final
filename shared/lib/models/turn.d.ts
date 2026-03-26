export declare const TurnStatus: {
    readonly WAITING: "waiting";
    readonly CALLED: "called";
    readonly ATTENDING: "attending";
    readonly FINISHED: "finished";
    readonly NO_SHOW: "no_show";
    readonly CANCELLED: "cancelled";
};
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
//# sourceMappingURL=turn.d.ts.map