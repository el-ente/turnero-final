import {db} from "../config/firebase-admin";

export function mockRunTransaction() {
  const transaction = {get: jest.fn(), set: jest.fn(), update: jest.fn()};
  (db.runTransaction as jest.Mock).mockImplementation(
    (fn: (t: typeof transaction) => Promise<void>) => fn(transaction)
  );
  return transaction;
}
