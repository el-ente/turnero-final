import {setGlobalOptions} from "firebase-functions";
import {createTurnHandler, getCurrentTurnHandler, cancelTurnHandler} from "./controllers/turnController";
import {
  nextTurnHandler,
  callTurnHandler,
  startTurnHandler,
  finishTurnHandler,
  recallTurnHandler,
  noShowHandler,
} from "./controllers/terminalController";
import {
  getQueueStatsHandler,
  createSectorHandler, listSectorsHandler, updateSectorHandler, deleteSectorHandler,
  createQueueHandler, listQueuesHandler, updateQueueHandler, deleteQueueHandler,
  createTerminalHandler, listTerminalsHandler, updateTerminalHandler, deleteTerminalHandler,
} from "./controllers/adminController";

setGlobalOptions({maxInstances: 10});

// Turn endpoints
export const createTurn = createTurnHandler;
export const getCurrentTurn = getCurrentTurnHandler;
export const cancelTurn = cancelTurnHandler;

// Terminal endpoints
export const nextTurn = nextTurnHandler;
export const callTurn = callTurnHandler;
export const startTurn = startTurnHandler;
export const finishTurn = finishTurnHandler;
export const recallTurn = recallTurnHandler;
export const noShow = noShowHandler;

// Admin endpoints
export const getQueueStats = getQueueStatsHandler;

// CRUD — Sectors
export const createSector = createSectorHandler;
export const listSectors = listSectorsHandler;
export const updateSector = updateSectorHandler;
export const deleteSector = deleteSectorHandler;

// CRUD — Queues
export const createQueue = createQueueHandler;
export const listQueues = listQueuesHandler;
export const updateQueue = updateQueueHandler;
export const deleteQueue = deleteQueueHandler;

// CRUD — Terminals
export const createTerminal = createTerminalHandler;
export const listTerminals = listTerminalsHandler;
export const updateTerminal = updateTerminalHandler;
export const deleteTerminal = deleteTerminalHandler;
