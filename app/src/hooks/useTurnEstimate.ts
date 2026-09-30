import { useEffect, useState } from "react";
import type { Queue, Turn } from "shared";
import { collection, doc, getCountFromServer, onSnapshot, query, where } from "firebase/firestore";
import { db } from "../lib/firebase";
import { toDate } from "../lib/dates";

// Used until the queue has a measured call pace — overestimating the wait
// hurts less than promising a time that goes by.
const DEFAULT_CALL_INTERVAL_SECONDS = 10 * 60;
const CLOCK_TICK_MS = 60_000;

export interface TurnEstimate {
  position: number;
  estimatedAt: Date;
}

interface QueuePace {
  lastCalledAt?: Date;
  avgCallIntervalSeconds?: number;
}

function estimateCallTime(pace: QueuePace, position: number, nowMs: number): Date {
  const intervalMs = (pace.avgCallIntervalSeconds ?? DEFAULT_CALL_INTERVAL_SECONDS) * 1000;
  // An overdue next call is assumed imminent instead of placed in the past.
  const nextCallMs = pace.lastCalledAt ? Math.max(nowMs, pace.lastCalledAt.getTime() + intervalMs) : nowMs;
  return new Date(nextCallMs + position * intervalMs);
}

function toQueuePace(queue: Queue | undefined): QueuePace {
  return {
    lastCalledAt: queue?.lastCalledAt ? toDate(queue.lastCalledAt) : undefined,
    avgCallIntervalSeconds: queue?.avgCallIntervalSeconds,
  };
}

// Position is counted within the turn's own queue only (every strategy
// serves a queue in queuedAt order); turns from other queues served first
// are already reflected in the queue's measured call pace. Refreshes on each
// change to the queue doc — i.e. on every call from this queue — with one
// aggregate count read, so an open tab costs ~2 reads per call.
export function useTurnEstimate(turn: Turn | null) {
  const [position, setPosition] = useState<number | null>(null);
  const [pace, setPace] = useState<QueuePace | null>(null);
  const [nowMs, setNowMs] = useState(Date.now);
  const [hasError, setHasError] = useState(false);

  const isWaiting = turn?.status === "waiting";
  const queueId = turn?.queueId;
  const queuedAtMs = turn ? toDate(turn.queuedAt).getTime() : null;

  useEffect(() => {
    if (!isWaiting || !queueId || queuedAtMs === null) {
      setPosition(null);
      setPace(null);
      return;
    }

    let isCancelled = false;
    let latestRequestId = 0;
    const turnsAheadQuery = query(
      collection(db, "turns"),
      where("queueId", "==", queueId),
      where("status", "==", "waiting"),
      where("queuedAt", "<", new Date(queuedAtMs))
    );

    const refreshPosition = async () => {
      const requestId = ++latestRequestId;
      try {
        const snapshot = await getCountFromServer(turnsAheadQuery);
        if (isCancelled || requestId !== latestRequestId) return;
        setPosition(snapshot.data().count);
        setHasError(false);
      } catch (error) {
        console.error("useTurnEstimate position count:", error);
        if (!isCancelled) setHasError(true);
      }
    };

    const unsubscribe = onSnapshot(
      doc(db, "queues", queueId),
      (snap) => {
        setPace(toQueuePace(snap.data() as Queue | undefined));
        setNowMs(Date.now());
        refreshPosition();
      },
      (error) => {
        console.error("useTurnEstimate queue listener:", error);
        setHasError(true);
      }
    );

    return () => {
      isCancelled = true;
      unsubscribe();
    };
  }, [isWaiting, queueId, queuedAtMs]);

  // Keeps the estimate from drifting into the past while no calls happen.
  useEffect(() => {
    if (!isWaiting) return;
    const timer = setInterval(() => setNowMs(Date.now()), CLOCK_TICK_MS);
    return () => clearInterval(timer);
  }, [isWaiting]);

  const estimate: TurnEstimate | null =
    isWaiting && position !== null && pace
      ? { position, estimatedAt: estimateCallTime(pace, position, nowMs) }
      : null;

  return { estimate, hasError };
}
