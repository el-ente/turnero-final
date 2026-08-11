import {onRequest} from "firebase-functions/v2/https";
import {AppUser, UserRole, canAccessTerminal} from "shared";
import {
  getNextTurn, callTurn, startTurn, finishTurn, recallTurn, handleNoShow, getTerminalById,
} from "../services/terminalService";
import {BusinessError, ForbiddenError} from "../utils/errors";
import {logger} from "../config/firebase-admin";
import {requireRole} from "../middleware/auth";

const STAFF_ROLES = [UserRole.CASHIER, UserRole.SUPERVISOR, UserRole.ADMIN];

// A cashier may only operate terminals in their assigned sector(s); admin
// and supervisor can operate any terminal.
async function assertTerminalAccess(user: AppUser, terminalId: string) {
  const terminal = await getTerminalById(terminalId);
  if (!canAccessTerminal(user, terminal)) {
    throw new ForbiddenError(`Not assigned to terminal ${terminalId}'s sector`);
  }
}

export const nextTurnHandler = onRequest({cors: true}, requireRole(STAFF_ROLES, async (req, res, user) => {
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

export const callTurnHandler = onRequest({cors: true}, requireRole(STAFF_ROLES, async (req, res, user) => {
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

export const startTurnHandler = onRequest({cors: true}, requireRole(STAFF_ROLES, async (req, res, user) => {
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

export const finishTurnHandler = onRequest({cors: true}, requireRole(STAFF_ROLES, async (req, res, user) => {
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

export const recallTurnHandler = onRequest({cors: true}, requireRole(STAFF_ROLES, async (req, res, user) => {
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

export const noShowHandler = onRequest({cors: true}, requireRole(STAFF_ROLES, async (req, res, user) => {
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
