import { onRequest } from "firebase-functions/v2/https";
import { getQueueStats } from "../services/statsService";
import { BusinessError } from "../utils/errors";
import { db, logger } from "../config/firebase-admin";

export const getQueueStatsHandler = onRequest({ cors: true }, async (req, res) => {
  try {
    if (req.method !== "GET") {
      res.status(405).json({ error: "Method not allowed" });
      return;
    }

    const { queueId } = req.query;
    if (!queueId || typeof queueId !== "string") {
      res.status(400).json({ error: "queueId query parameter is required" });
      return;
    }

    const stats = await getQueueStats(queueId);
    res.status(200).json(stats);
  } catch (error) {
    if (error instanceof BusinessError) {
      res.status(error.statusCode).json({ error: error.message, code: error.code });
    } else {
      logger.error("Error getting queue stats:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }
});

export const updateQueueConfigHandler = onRequest({ cors: true }, async (req, res) => {
  try {
    if (req.method !== "PUT") {
      res.status(405).json({ error: "Method not allowed" });
      return;
    }

    const { queueId } = req.query;
    if (!queueId || typeof queueId !== "string") {
      res.status(400).json({ error: "queueId query parameter is required" });
      return;
    }

    const { name, type, reenqueueConfig, priorityWeight } = req.body;

    // Verify queue exists
    const queueDoc = await db.collection("queues").doc(queueId).get();
    if (!queueDoc.exists) {
      res.status(404).json({ error: "Queue not found" });
      return;
    }

    const updateData: any = {};
    if (name !== undefined) updateData.name = name;
    if (type !== undefined) updateData.type = type;
    if (reenqueueConfig !== undefined) updateData.reenqueueConfig = reenqueueConfig;
    if (priorityWeight !== undefined) updateData.priorityWeight = priorityWeight;
    updateData.updatedAt = new Date();

    await db.collection("queues").doc(queueId).update(updateData);

    const updatedDoc = await db.collection("queues").doc(queueId).get();
    res.status(200).json(updatedDoc.data());
  } catch (error) {
    if (error instanceof BusinessError) {
      res.status(error.statusCode).json({ error: error.message, code: error.code });
    } else {
      logger.error("Error updating queue config:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }
});
