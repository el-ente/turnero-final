export function toDate(val: any): Date {
  if (val?.toDate) return val.toDate(); // Firestore Timestamp
  return new Date(val);
}
