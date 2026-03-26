import { setGlobalOptions } from "firebase-functions";
import { createTurnHandler, getCurrentTurnHandler } from "./controllers/turnController";
import {
  nextTurnHandler,
  callTurnHandler,
  startTurnHandler,
  finishTurnHandler,
  recallTurnHandler,
  noShowHandler,
} from "./controllers/terminalController";
import { getQueueStatsHandler, updateQueueConfigHandler } from "./controllers/adminController";

setGlobalOptions({ maxInstances: 10 });

// Turn endpoints
export const createTurn = createTurnHandler;
export const getCurrentTurn = getCurrentTurnHandler;

// Terminal endpoints
export const nextTurn = nextTurnHandler;
export const callTurn = callTurnHandler;
export const startTurn = startTurnHandler;
export const finishTurn = finishTurnHandler;
export const recallTurn = recallTurnHandler;
export const noShow = noShowHandler;

// Admin endpoints
export const getQueueStats = getQueueStatsHandler;
export const updateQueueConfig = updateQueueConfigHandler;
