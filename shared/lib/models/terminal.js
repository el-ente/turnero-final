"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TerminalStatus = exports.ServingStrategy = void 0;
exports.ServingStrategy = {
    RATIO_BASED: "ratio_based",
    FIFO_ACROSS_QUEUES: "fifo_across_queues",
};
exports.TerminalStatus = {
    AVAILABLE: "available",
    BUSY: "busy",
    OFFLINE: "offline",
};
