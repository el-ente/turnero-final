"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TurnStatus = void 0;
var TurnStatus;
(function (TurnStatus) {
    TurnStatus["WAITING"] = "waiting";
    TurnStatus["CALLED"] = "called";
    TurnStatus["ATTENDING"] = "attending";
    TurnStatus["FINISHED"] = "finished";
    TurnStatus["NO_SHOW"] = "no_show";
    TurnStatus["CANCELLED"] = "cancelled";
})(TurnStatus || (exports.TurnStatus = TurnStatus = {}));
