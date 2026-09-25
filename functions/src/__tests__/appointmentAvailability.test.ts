import {computeCandidateSlots, applyBlocks, subtractCounts, slotKey} from "../services/appointmentAvailability";
import {AvailabilityRule, AppointmentBlock} from "shared";

describe("appointmentAvailability", () => {
  describe("computeCandidateSlots", () => {
    it("generates slots only on matching days of week within the time range", () => {
      // 2026-09-28 is a Monday, 2026-09-29 is a Tuesday
      const rules: AvailabilityRule[] = [{daysOfWeek: [1], startTime: "09:00", endTime: "10:00"}];
      const slots = computeCandidateSlots(rules, 30, "2026-09-28", "2026-09-29");
      expect(slots).toEqual([
        {date: "2026-09-28", startTime: "09:00"},
        {date: "2026-09-28", startTime: "09:30"},
      ]);
    });

    it("does not produce a trailing slot that would overflow endTime", () => {
      const rules: AvailabilityRule[] = [{daysOfWeek: [1], startTime: "09:00", endTime: "09:45"}];
      const slots = computeCandidateSlots(rules, 30, "2026-09-28", "2026-09-28");
      expect(slots).toEqual([{date: "2026-09-28", startTime: "09:00"}]);
    });

    it("combines multiple rules for the same date range", () => {
      const rules: AvailabilityRule[] = [
        {daysOfWeek: [1], startTime: "09:00", endTime: "09:30"},
        {daysOfWeek: [1], startTime: "14:00", endTime: "14:30"},
      ];
      const slots = computeCandidateSlots(rules, 30, "2026-09-28", "2026-09-28");
      expect(slots).toEqual([
        {date: "2026-09-28", startTime: "09:00"},
        {date: "2026-09-28", startTime: "14:00"},
      ]);
    });

    it("returns nothing when no rule matches the day of week", () => {
      const rules: AvailabilityRule[] = [{daysOfWeek: [0, 6], startTime: "09:00", endTime: "12:00"}];
      const slots = computeCandidateSlots(rules, 30, "2026-09-28", "2026-09-29");
      expect(slots).toEqual([]);
    });
  });

  describe("applyBlocks", () => {
    const candidates = [
      {date: "2026-09-28", startTime: "09:00"},
      {date: "2026-09-28", startTime: "09:30"},
      {date: "2026-09-28", startTime: "10:00"},
    ];

    it("removes slots covered by a full-day block", () => {
      const blocks: AppointmentBlock[] = [
        {id: "b1", serviceId: null, date: "2026-09-28", createdAt: new Date()},
      ];
      expect(applyBlocks(candidates, blocks)).toEqual([]);
    });

    it("removes only slots within a partial time-range block", () => {
      const blocks: AppointmentBlock[] = [
        {id: "b1", serviceId: null, date: "2026-09-28", startTime: "09:00", endTime: "10:00", createdAt: new Date()},
      ];
      expect(applyBlocks(candidates, blocks)).toEqual([{date: "2026-09-28", startTime: "10:00"}]);
    });

    it("ignores blocks for a different date", () => {
      const blocks: AppointmentBlock[] = [
        {id: "b1", serviceId: null, date: "2026-09-29", createdAt: new Date()},
      ];
      expect(applyBlocks(candidates, blocks)).toEqual(candidates);
    });
  });

  describe("subtractCounts", () => {
    const candidates = [
      {date: "2026-09-28", startTime: "09:00"},
      {date: "2026-09-28", startTime: "09:30"},
    ];

    it("excludes slots that reached capacity and keeps the rest", () => {
      const counts = {[slotKey(candidates[0])]: 1};
      const result = subtractCounts(candidates, 1, counts);
      expect(result).toEqual([{date: "2026-09-28", startTime: "09:30", remainingCapacity: 1}]);
    });

    it("reports remaining capacity for partially booked slots", () => {
      const counts = {[slotKey(candidates[0])]: 1};
      const result = subtractCounts(candidates, 3, counts);
      expect(result).toEqual([
        {date: "2026-09-28", startTime: "09:00", remainingCapacity: 2},
        {date: "2026-09-28", startTime: "09:30", remainingCapacity: 3},
      ]);
    });
  });
});
