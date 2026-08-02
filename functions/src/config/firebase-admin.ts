import * as admin from "firebase-admin";
import {logger} from "firebase-functions";

admin.initializeApp();

export const db = admin.firestore();
export const auth = admin.auth();
export {logger};
