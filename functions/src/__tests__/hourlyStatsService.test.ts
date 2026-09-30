import {aggregateRollupsByWeekdayHour, getHourlyStats} from "../services/hourlyStatsService";
import {aggregateTurnsByHour, emptyHourlyBuckets} from "../services/statsService";
import {db} from "../config/firebase-admin";
import {QueueDailyStats, Turn, TurnStatus} from "shared";

jest.mock("../config/firebase-admin");

function makeTurn(overrides: Partial<Turn> = {}): Turn {
  return {
    id: "turn-1",
    memberNumber: 1,
    queueId: "queue-1",
    queuedAt: new Date(),
    status: TurnStatus.WAITING,
    channel: "totem",
    recallCount: 0,
    createdAt: new Date("2026-09-21T13:00:00Z"), // 10:00 Argentina
    ...overrides,
  };
}

function makeRollup(date: string, hourly: Partial<Record<number, Partial<QueueDailyStats["hourly"][number]>>>, overrides: Partial<QueueDailyStats> = {}): QueueDailyStats {
  const buckets = emptyHourlyBuckets();
  for (const [hour, bucket] of Object.entries(hourly)) {
    buckets[Number(hour)] = {...buckets[Number(hour)], ...bucket};
  }
  return {
    queueId: "queue-1", date,
    totalCreated: 0, waitingCount: 0, calledCount: 0, attendingCount: 0, finishedCount: 0,
    noShowCount: 0, cancelledCount: 0, totalWaitTimeSeconds: 0, totalServiceTimeSeconds: 0,
    hourly: buckets, computedAt: new Date(),
    ...overrides,
  };
}

describe("aggregateTurnsByHour", () => {
  it("buckets turns by their Argentina creation hour", () => {
    const buckets = aggregateTurnsByHour([
      makeTurn({createdAt: new Date("2026-09-21T13:05:00Z")}),
      makeTurn({createdAt: new Date("2026-09-21T13:50:00Z")}),
      makeTurn({createdAt: new Date("2026-09-22T02:30:00Z")}), // 23:30 Argentina on the 21st
    ]);

    expect(buckets).toHaveLength(24);
    expect(buckets[10].created).toBe(2);
    expect(buckets[23].created).toBe(1);
    expect(buckets.reduce((sum, b) => sum + b.created, 0)).toBe(3);
  });

  it("attributes finished turns' wait and service time to the arrival hour only", () => {
    const buckets = aggregateTurnsByHour([
      makeTurn({
        status: TurnStatus.FINISHED,
        createdAt: new Date("2026-09-21T13:00:00Z"),
        calledAt: new Date("2026-09-21T13:10:00Z"),
        attendingAt: new Date("2026-09-21T14:00:00Z"), // service starts in the next hour
        finishedAt: new Date("2026-09-21T14:05:00Z"),
      }),
      makeTurn({status: TurnStatus.NO_SHOW, createdAt: new Date("2026-09-21T13:00:00Z"), calledAt: new Date("2026-09-21T13:30:00Z")}),
    ]);

    expect(buckets[10]).toEqual({created: 2, finished: 1, totalWaitTimeSeconds: 600, totalServiceTimeSeconds: 300});
    expect(buckets[11].created).toBe(0);
  });
});

describe("aggregateRollupsByWeekdayHour", () => {
  it("merges the same weekday across weeks and averages per sampled day", () => {
    const {cells, dates} = aggregateRollupsByWeekdayHour([
      makeRollup("2026-09-14", {10: {created: 4, finished: 2, totalWaitTimeSeconds: 600}}), // Monday
      makeRollup("2026-09-21", {10: {created: 2, finished: 1, totalWaitTimeSeconds: 900}}), // Monday
      makeRollup("2026-09-22", {10: {created: 1}}), // Tuesday
    ]);

    expect(dates).toEqual(["2026-09-14", "2026-09-21", "2026-09-22"]);
    expect(cells).toEqual([
      {dayOfWeek: 1, hour: 10, created: 6, finished: 3, avgCreatedPerDay: 3, avgWaitTimeSeconds: 500, avgServiceTimeSeconds: 0},
      {dayOfWeek: 2, hour: 10, created: 1, finished: 0, avgCreatedPerDay: 1, avgWaitTimeSeconds: null, avgServiceTimeSeconds: null},
    ]);
  });

  it("sums several queues of the same date into one cell but counts the date once", () => {
    const {cells, dates} = aggregateRollupsByWeekdayHour([
      makeRollup("2026-09-21", {9: {created: 3}}, {queueId: "queue-1"}),
      makeRollup("2026-09-21", {9: {created: 5}}, {queueId: "queue-2"}),
    ]);

    expect(dates).toEqual(["2026-09-21"]);
    expect(cells).toEqual([expect.objectContaining({dayOfWeek: 1, hour: 9, created: 8, avgCreatedPerDay: 8})]);
  });

  it("skips legacy rollups without hourly buckets instead of counting them as empty days", () => {
    const legacy = {...makeRollup("2026-09-14", {}), hourly: undefined} as unknown as QueueDailyStats;
    const {cells, dates} = aggregateRollupsByWeekdayHour([
      legacy,
      makeRollup("2026-09-21", {10: {created: 2}}),
    ]);

    expect(dates).toEqual(["2026-09-21"]);
    expect(cells[0].avgCreatedPerDay).toBe(2);
  });
});

describe("getHourlyStats", () => {
  function mockFirestore(options: {sectorExists?: boolean; queueIds?: string[]; rollups?: QueueDailyStats[]}) {
    const rollupsGet = jest.fn().mockResolvedValue({docs: (options.rollups ?? []).map((r) => ({data: () => r}))});
    const rollupsWhere = jest.fn();
    rollupsWhere.mockReturnValue({where: rollupsWhere, get: rollupsGet});
    (db.collection as jest.Mock).mockImplementation((name: string) => {
      if (name === "sectors") return {doc: jest.fn().mockReturnValue({get: jest.fn().mockResolvedValue({exists: options.sectorExists ?? true})})};
      if (name === "queues") {
        return {where: jest.fn().mockReturnValue({get: jest.fn().mockResolvedValue({docs: (options.queueIds ?? ["queue-1"]).map((id) => ({id}))})})};
      }
      if (name === "queueDailyStats") return {where: rollupsWhere};
      throw new Error(`unexpected collection: ${name}`);
    });
    return {rollupsWhere, rollupsGet};
  }

  beforeEach(() => jest.clearAllMocks());

  it("throws NotFound for a missing sector", async () => {
    mockFirestore({sectorExists: false});
    await expect(getHourlyStats("sector-x", 7, null)).rejects.toThrow("Sector sector-x not found");
  });

  it("rejects a queueId that doesn't belong to the sector", async () => {
    mockFirestore({queueIds: ["queue-1"]});
    await expect(getHourlyStats("sector-1", 7, "queue-9")).rejects.toThrow("Queue queue-9 not found in sector sector-1");
  });

  it("queries the rollups for the sector's queues within the date window", async () => {
    const {rollupsWhere} = mockFirestore({queueIds: ["queue-1", "queue-2"], rollups: [makeRollup("2026-09-21", {10: {created: 1}})]});

    const stats = await getHourlyStats("sector-1", 7, null);

    expect(rollupsWhere).toHaveBeenCalledWith("queueId", "in", ["queue-1", "queue-2"]);
    expect(rollupsWhere).toHaveBeenCalledWith("date", ">=", stats.from);
    expect(rollupsWhere).toHaveBeenCalledWith("date", "<=", stats.to);
    expect(stats.days).toBe(7);
    expect(stats.queueId).toBeNull();
    expect(stats.datesCovered).toBe(1);
    expect(stats.firstDate).toBe("2026-09-21");
    expect(stats.cells).toHaveLength(1);
  });

  it("returns an empty result without querying rollups for a sector with no queues", async () => {
    const {rollupsGet} = mockFirestore({queueIds: []});

    const stats = await getHourlyStats("sector-1", 30, null);

    expect(rollupsGet).not.toHaveBeenCalled();
    expect(stats).toMatchObject({datesCovered: 0, firstDate: null, cells: []});
  });
});
