import { onRequest } from "firebase-functions/v2/https";
import { createTurn, getCurrentTurn } from "../services/turnService";
import { BusinessError } from "../utils/errors";
import { logger } from "../config/firebase-admin";

export const createTurnHandler = onRequest({ cors: true }, async (req, res) => {
  try {
    if (req.method !== "POST") {
      res.status(405).json({ error: "Method not allowed" });
      return;
    }

    const { queueId, memberId, channel } = req.body;

    if (!queueId || !memberId) {
      res.status(400).json({ error: "queueId and memberId are required" });
      return;
    }

    const turn = await createTurn(queueId, memberId, channel || "totem");
    res.status(201).json(turn);
  } catch (error) {
    if (error instanceof BusinessError) {
      res.status(error.statusCode).json({ error: error.message, code: error.code });
    } else {
      logger.error("Error creating turn:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }
});

export const getCurrentTurnHandler = onRequest({ cors: true }, async (req, res) => {
  try {
    if (req.method !== "GET") {
      res.status(405).json({ error: "Method not allowed" });
      return;
    }

    const { memberId } = req.query;

    if (!memberId || typeof memberId !== "string") {
      res.status(400).json({ error: "memberId query parameter is required" });
      return;
    }

    const turn = await getCurrentTurn(memberId);
    if (!turn) {
      res.status(404).json({ error: "No active turn found" });
      return;
    }

    res.status(200).json(turn);
  } catch (error) {
    logger.error("Error getting current turn:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});
