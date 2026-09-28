import {onRequest} from "firebase-functions/v2/https";
import {AppUser, UserRole, canAccessTerminal} from "shared";
import {
  getNextTurn, callTurn, startTurn, finishTurn, recallTurn, handleNoShow, getTerminalById,
  reassignTerminalQueues, setTerminalStatus,
} from "../services/terminalService";
import {BusinessError, ForbiddenError} from "../utils/errors";
import {logger} from "../config/firebase-admin";
import {requireRole} from "../middleware/auth";

const STAFF_ROLES = [UserRole.CASHIER, UserRole.SUPERVISOR, UserRole.ADMIN];

// Firestore "in" caps at 30 values (same assumption as adminService.ts's deleteSector).
const MAX_QUEUE_IDS = 30;

// A cashier may only operate terminals in their assigned sector(s); admin
// and supervisor can operate any terminal.
async function assertTerminalAccess(user: AppUser, terminalId: string) {
  const terminal = await getTerminalById(terminalId);
  if (!canAccessTerminal(user, terminal)) {
    throw new ForbiddenError(`Not assigned to terminal ${terminalId}'s sector`);
  }
}

export const nextTurnHandler = onRequest({cors: true, invoker: "public"}, requireRole(STAFF_ROLES, async (req, res, user) => {
  try {
    if (req.method !== "POST") {
      res.status(405).json({error: "Method not allowed"});
      return;
    }

    const {terminalId} = req.body;
    if (!terminalId) {
      res.status(400).json({error: "terminalId is required"});
      return;
    }

    await assertTerminalAccess(user, terminalId);

    const turn = await getNextTurn(terminalId);
    if (!turn) {
      res.status(404).json({error: "No waiting turns"});
      return;
    }

    res.status(200).json(turn);
  } catch (error) {
    if (error instanceof BusinessError) {
      res.status(error.statusCode).json({error: error.message, code: error.code});
    } else {
      logger.error("Error getting next turn:", error);
      res.status(500).json({error: "Internal server error"});
    }
  }
}));

export const callTurnHandler = onRequest({cors: true, invoker: "public"}, requireRole(STAFF_ROLES, async (req, res, user) => {
  try {
    if (req.method !== "POST") {
      res.status(405).json({error: "Method not allowed"});
      return;
    }

    const {terminalId, turnId} = req.body;
    if (!terminalId || !turnId) {
      res.status(400).json({error: "terminalId and turnId are required"});
      return;
    }

    await assertTerminalAccess(user, terminalId);

    await callTurn(terminalId, turnId);
    res.status(200).json({success: true});
  } catch (error) {
    if (error instanceof BusinessError) {
      res.status(error.statusCode).json({error: error.message, code: error.code});
    } else {
      logger.error("Error calling turn:", error);
      res.status(500).json({error: "Internal server error"});
    }
  }
}));

export const startTurnHandler = onRequest({cors: true, invoker: "public"}, requireRole(STAFF_ROLES, async (req, res, user) => {
  try {
    if (req.method !== "POST") {
      res.status(405).json({error: "Method not allowed"});
      return;
    }

    const {terminalId, turnId} = req.body;
    if (!terminalId || !turnId) {
      res.status(400).json({error: "terminalId and turnId are required"});
      return;
    }

    await assertTerminalAccess(user, terminalId);

    await startTurn(terminalId, turnId);
    res.status(200).json({success: true});
  } catch (error) {
    if (error instanceof BusinessError) {
      res.status(error.statusCode).json({error: error.message, code: error.code});
    } else {
      logger.error("Error starting turn:", error);
      res.status(500).json({error: "Internal server error"});
    }
  }
}));

export const finishTurnHandler = onRequest({cors: true, invoker: "public"}, requireRole(STAFF_ROLES, async (req, res, user) => {
  try {
    if (req.method !== "POST") {
      res.status(405).json({error: "Method not allowed"});
      return;
    }

    const {terminalId, turnId} = req.body;
    if (!terminalId || !turnId) {
      res.status(400).json({error: "terminalId and turnId are required"});
      return;
    }

    await assertTerminalAccess(user, terminalId);

    await finishTurn(terminalId, turnId);
    res.status(200).json({success: true});
  } catch (error) {
    if (error instanceof BusinessError) {
      res.status(error.statusCode).json({error: error.message, code: error.code});
    } else {
      logger.error("Error finishing turn:", error);
      res.status(500).json({error: "Internal server error"});
    }
  }
}));

export const recallTurnHandler = onRequest({cors: true, invoker: "public"}, requireRole(STAFF_ROLES, async (req, res, user) => {
  try {
    if (req.method !== "POST") {
      res.status(405).json({error: "Method not allowed"});
      return;
    }

    const {terminalId, turnId} = req.body;
    if (!terminalId || !turnId) {
      res.status(400).json({error: "terminalId and turnId are required"});
      return;
    }

    await assertTerminalAccess(user, terminalId);

    await recallTurn(terminalId, turnId);
    res.status(200).json({success: true});
  } catch (error) {
    if (error instanceof BusinessError) {
      res.status(error.statusCode).json({error: error.message, code: error.code});
    } else {
      logger.error("Error recalling turn:", error);
      res.status(500).json({error: "Internal server error"});
    }
  }
}));

export const noShowHandler = onRequest({cors: true, invoker: "public"}, requireRole(STAFF_ROLES, async (req, res, user) => {
  try {
    if (req.method !== "POST") {
      res.status(405).json({error: "Method not allowed"});
      return;
    }

    const {terminalId, turnId} = req.body;
    if (!terminalId || !turnId) {
      res.status(400).json({error: "terminalId and turnId are required"});
      return;
    }

    await assertTerminalAccess(user, terminalId);

    await handleNoShow(terminalId, turnId);
    res.status(200).json({success: true});
  } catch (error) {
    if (error instanceof BusinessError) {
      res.status(error.statusCode).json({error: error.message, code: error.code});
    } else {
      logger.error("Error handling no-show:", error);
      res.status(500).json({error: "Internal server error"});
    }
  }
}));

// Self-service: lets the operator change which queues their own terminal
// serves, without going through Admin. Only allowed while the terminal isn't
// mid-turn (see reassignTerminalQueues) — the button that drives this is
// disabled client-side too, but the check has to hold server-side regardless.
export const reassignTerminalQueuesHandler = onRequest({cors: true, invoker: "public"}, requireRole(STAFF_ROLES, async (req, res, user) => {
  try {
    if (req.method !== "POST") {
      res.status(405).json({error: "Method not allowed"});
      return;
    }

    const {terminalId, queueIds} = req.body;
    const queueIdsAreStrings = Array.isArray(queueIds) && queueIds.every((id: unknown) => typeof id === "string");
    if (!terminalId || !queueIdsAreStrings) {
      res.status(400).json({error: "terminalId and queueIds (string[]) are required"});
      return;
    }
    const uniqueQueueIds: string[] = Array.from(new Set(queueIds));
    if (uniqueQueueIds.length === 0 || uniqueQueueIds.length > MAX_QUEUE_IDS) {
      res.status(400).json({error: `queueIds must contain 1 to ${MAX_QUEUE_IDS} unique ids`});
      return;
    }

    await assertTerminalAccess(user, terminalId);

    const updated = await reassignTerminalQueues(terminalId, uniqueQueueIds);
    res.status(200).json(updated);
  } catch (error) {
    if (error instanceof BusinessError) {
      res.status(error.statusCode).json({error: error.message, code: error.code});
    } else {
      logger.error("Error reassigning terminal queues:", error);
      res.status(500).json({error: "Internal server error"});
    }
  }
}));

export const setTerminalStatusHandler = onRequest({cors: true, invoker: "public"}, requireRole(STAFF_ROLES, async (req, res, user) => {
  try {
    if (req.method !== "POST") {
      res.status(405).json({error: "Method not allowed"});
      return;
    }

    const {terminalId, status} = req.body;
    if (!terminalId || !status) {
      res.status(400).json({error: "terminalId and status are required"});
      return;
    }

    await assertTerminalAccess(user, terminalId);

    await setTerminalStatus(terminalId, status);
    res.status(200).json({success: true});
  } catch (error) {
    if (error instanceof BusinessError) {
      res.status(error.statusCode).json({error: error.message, code: error.code});
    } else {
      logger.error("Error setting terminal status:", error);
      res.status(500).json({error: "Internal server error"});
    }
  }
}));
