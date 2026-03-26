import { setGlobalOptions } from "firebase-functions";
import { createTurnHandler, getCurrentTurnHandler } from "./controllers/turnController";

setGlobalOptions({ maxInstances: 10 });

// Turn endpoints
export const createTurn = createTurnHandler;
export const getCurrentTurn = getCurrentTurnHandler;
