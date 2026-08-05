// Turn's Date-typed fields arrive as Firestore Timestamps at runtime (Admin SDK
// doesn't convert them), not native Dates — mirrors app/src/lib/dates.ts on the client.
export function toMillis(value: Date | { toDate(): Date }): number {
  return typeof (value as { toDate?: () => Date }).toDate === "function" ?
    (value as { toDate(): Date }).toDate().getTime() :
    (value as Date).getTime();
}
