export function toDate(val: any): Date {
  if (val?.toDate) return val.toDate(); // Firestore Timestamp (client SDK, real-time listeners)
  if (val && typeof val._seconds === "number") {
    // Firestore Timestamp serialized over HTTP by a Cloud Function response —
    // it loses its class/toDate() method in the JSON round-trip.
    return new Date(val._seconds * 1000 + Math.round((val._nanoseconds ?? 0) / 1e6));
  }
  return new Date(val);
}
