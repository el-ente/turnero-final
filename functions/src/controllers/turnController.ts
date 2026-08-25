import {onRequest} from "firebase-functions/v2/https";
import {createTurn, getCurrentTurn, cancelTurn} from "../services/turnService";
import {BusinessError} from "../utils/errors";
import {logger} from "../config/firebase-admin";

export const createTurnHandler = onRequest({cors: true}, async (req, res) => {
  try {
    if (req.method !== "POST") {
      res.status(405).json({error: "Method not allowed"});
      return;
    }

    const {queueId, memberNumber, channel} = req.body;

    if (!queueId || !memberNumber) {
      res.status(400).json({error: "queueId and memberNumber are required"});
      return;
    }

    const turn = await createTurn(queueId, memberNumber, channel || "totem");
    res.status(201).json(turn);
  } catch (error) {
    if (error instanceof BusinessError) {
      res.status(error.statusCode).json({error: error.message, code: error.code});
    } else {
      logger.error("Error creating turn:", error);
      res.status(500).json({error: "Internal server error"});
    }
  }
});

export const getCurrentTurnHandler = onRequest({cors: true}, async (req, res) => {
  try {
    if (req.method !== "GET") {
      res.status(405).json({error: "Method not allowed"});
      return;
    }

    const memberNumber = Number(req.query.memberNumber);

    if (!Number.isInteger(memberNumber)) {
      res.status(400).json({error: "memberNumber query parameter must be an integer"});
      return;
    }

    const turn = await getCurrentTurn(memberNumber);
    if (!turn) {
      res.status(404).json({error: "No active turn found"});
      return;
    }

    res.status(200).json(turn);
  } catch (error) {
    logger.error("Error getting current turn:", error);
    res.status(500).json({error: "Internal server error"});
  }
});

export const cancelTurnHandler = onRequest({cors: true}, async (req, res) => {
  try {
    if (req.method !== "POST") {
      res.status(405).json({error: "Method not allowed"});
      return;
    }

    const {turnId, memberNumber} = req.body;

    if (!turnId || !memberNumber) {
      res.status(400).json({error: "turnId and memberNumber are required"});
      return;
    }

    await cancelTurn(turnId, memberNumber);
    res.status(200).json({success: true});
  } catch (error) {
    if (error instanceof BusinessError) {
      res.status(error.statusCode).json({error: error.message, code: error.code});
    } else {
      logger.error("Error cancelling turn:", error);
      res.status(500).json({error: "Internal server error"});
    }
  }
});
