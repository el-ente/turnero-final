import {onRequest} from "firebase-functions/v2/https";
import {getNextTurn, callTurn, startTurn, finishTurn, recallTurn, handleNoShow} from "../services/terminalService";
import {BusinessError} from "../utils/errors";
import {logger} from "../config/firebase-admin";

export const nextTurnHandler = onRequest({cors: true}, async (req, res) => {
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
});

export const callTurnHandler = onRequest({cors: true}, async (req, res) => {
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
});

export const startTurnHandler = onRequest({cors: true}, async (req, res) => {
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
});

export const finishTurnHandler = onRequest({cors: true}, async (req, res) => {
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
});

export const recallTurnHandler = onRequest({cors: true}, async (req, res) => {
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
});

export const noShowHandler = onRequest({cors: true}, async (req, res) => {
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
});
