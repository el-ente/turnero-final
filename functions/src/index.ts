import { setGlobalOptions } from "firebase-functions";
import { createTurnHandler, getCurrentTurnHandler } from "./controllers/turnController";
import {
  nextTurnHandler,
  callTurnHandler,
  startTurnHandler,
  finishTurnHandler,
} from "./controllers/terminalController";

setGlobalOptions({ maxInstances: 10 });

// Turn endpoints
export const createTurn = createTurnHandler;
export const getCurrentTurn = getCurrentTurnHandler;

// Terminal endpoints
export const nextTurn = nextTurnHandler;
export const callTurn = callTurnHandler;
export const startTurn = startTurnHandler;
export const finishTurn = finishTurnHandler;
