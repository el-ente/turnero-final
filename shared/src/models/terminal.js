"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TerminalStatus = exports.ServingStrategy = void 0;
var ServingStrategy;
(function (ServingStrategy) {
    ServingStrategy["RATIO_BASED"] = "ratio_based";
    ServingStrategy["FIFO_ACROSS_QUEUES"] = "fifo_across_queues";
})(ServingStrategy || (exports.ServingStrategy = ServingStrategy = {}));
var TerminalStatus;
(function (TerminalStatus) {
    TerminalStatus["AVAILABLE"] = "available";
    TerminalStatus["BUSY"] = "busy";
    TerminalStatus["OFFLINE"] = "offline";
})(TerminalStatus || (exports.TerminalStatus = TerminalStatus = {}));
//# sourceMappingURL=terminal.js.map