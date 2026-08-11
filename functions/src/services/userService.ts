import * as admin from "firebase-admin";
import {AppUser, UserRole, UserStatus} from "shared";
import {db} from "../config/firebase-admin";
import {NotFoundError, ValidationError, ConflictError} from "../utils/errors";

const USERS = "users";
const ADMIN_ALLOWLIST = (process.env.ADMIN_ALLOWLIST || "")
  .split(",")
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

function toAppUser(id: string, data: FirebaseFirestore.DocumentData): AppUser {
  return {
    id,
    uid: data.uid,
    email: data.email,
    displayName: data.displayName,
    role: data.role,
    assignedSectorIds: data.assignedSectorIds || [],
    status: data.status,
    createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : data.createdAt,
    updatedAt: data.updatedAt?.toDate ? data.updatedAt.toDate() : data.updatedAt,
  };
}

export async function getUserByUid(uid: string): Promise<AppUser | null> {
  const snap = await db.collection(USERS).doc(uid).get();
  if (!snap.exists) return null;
  return toAppUser(snap.id, snap.data() as FirebaseFirestore.DocumentData);
}

// Called right after a successful Google Sign-In. Resolves (creating if
// needed) the Firestore profile backing that Firebase Auth account:
//  1. Already provisioned at users/{uid} -> return it (refresh email/name).
//  2. An admin invited this email beforehand (pending doc, auto id) -> claim
//     it: create users/{uid} with the invited role/sectors, drop the invite.
//  3. Email is in ADMIN_ALLOWLIST -> auto-provision as an active admin.
//  4. Otherwise -> create a pending, roleless placeholder so an admin can
//     see the signup in the Users tab and activate it.
export async function bootstrapUser(uid: string, email: string, displayName?: string): Promise<AppUser> {
  const normalizedEmail = email.toLowerCase();
  const userRef = db.collection(USERS).doc(uid);

  return db.runTransaction(async (tx) => {
    const existing = await tx.get(userRef);
    if (existing.exists) {
      tx.update(userRef, {email: normalizedEmail, displayName, updatedAt: new Date()});
      return toAppUser(uid, {...existing.data(), email: normalizedEmail, displayName});
    }

    const inviteSnap = await tx.get(
      db.collection(USERS).where("email", "==", normalizedEmail).where("status", "==", UserStatus.PENDING).limit(1)
    );
    const invite = inviteSnap.docs[0];

    const now = new Date();
    let data: Omit<AppUser, "id">;
    if (invite) {
      const inviteData = invite.data();
      data = {
        uid,
        email: normalizedEmail,
        displayName,
        role: inviteData.role,
        assignedSectorIds: inviteData.assignedSectorIds || [],
        status: UserStatus.ACTIVE,
        createdAt: inviteData.createdAt?.toDate ? inviteData.createdAt.toDate() : now,
        updatedAt: now,
      };
      tx.delete(invite.ref);
    } else if (ADMIN_ALLOWLIST.includes(normalizedEmail)) {
      data = {
        uid,
        email: normalizedEmail,
        displayName,
        role: UserRole.ADMIN,
        assignedSectorIds: [],
        status: UserStatus.ACTIVE,
        createdAt: now,
        updatedAt: now,
      };
    } else {
      data = {
        uid,
        email: normalizedEmail,
        displayName,
        role: UserRole.CASHIER, // inert placeholder: status=pending blocks all access regardless
        assignedSectorIds: [],
        status: UserStatus.PENDING,
        createdAt: now,
        updatedAt: now,
      };
    }

    tx.set(userRef, data);
    return {id: uid, ...data};
  });
}

export async function listUsers(): Promise<AppUser[]> {
  const snap = await db.collection(USERS).orderBy("createdAt", "desc").get();
  return snap.docs.map((doc) => toAppUser(doc.id, doc.data()));
}

function assertValidRole(role: unknown): asserts role is UserRole {
  if (!Object.values(UserRole).includes(role as UserRole)) {
    throw new ValidationError(`role must be one of: ${Object.values(UserRole).join(", ")}`);
  }
}

// Admin pre-registers a staff member by email before they ever sign in.
// bootstrapUser() claims this doc on that email's first Google Sign-In.
export async function inviteUser(input: {
  email: string;
  role: UserRole;
  assignedSectorIds?: string[];
}): Promise<AppUser> {
  const email = (input.email || "").trim().toLowerCase();
  if (!email || !email.includes("@")) {
    throw new ValidationError("A valid email is required");
  }
  assertValidRole(input.role);

  const existing = await db.collection(USERS).where("email", "==", email).limit(1).get();
  if (!existing.empty) {
    throw new ConflictError(`A user with email ${email} already exists`);
  }

  const now = new Date();
  const data: Omit<AppUser, "id"> = {
    email,
    role: input.role,
    assignedSectorIds: input.assignedSectorIds || [],
    status: UserStatus.PENDING,
    createdAt: now,
    updatedAt: now,
  };
  const ref = await db.collection(USERS).add(data);
  return {id: ref.id, ...data};
}

export async function updateUserRole(
  id: string,
  updates: {role?: UserRole; assignedSectorIds?: string[]; status?: UserStatus}
): Promise<AppUser> {
  const ref = db.collection(USERS).doc(id);
  const snap = await ref.get();
  if (!snap.exists) {
    throw new NotFoundError(`User ${id} not found`);
  }

  if (updates.role !== undefined) assertValidRole(updates.role);
  if (updates.status !== undefined && !Object.values(UserStatus).includes(updates.status)) {
    throw new ValidationError(`status must be one of: ${Object.values(UserStatus).join(", ")}`);
  }

  const patch: admin.firestore.UpdateData<FirebaseFirestore.DocumentData> = {updatedAt: new Date()};
  if (updates.role !== undefined) patch.role = updates.role;
  if (updates.assignedSectorIds !== undefined) patch.assignedSectorIds = updates.assignedSectorIds;
  if (updates.status !== undefined) patch.status = updates.status;

  await ref.update(patch);
  const updated = await ref.get();
  return toAppUser(updated.id, updated.data() as FirebaseFirestore.DocumentData);
}

export async function deleteUser(id: string): Promise<void> {
  const ref = db.collection(USERS).doc(id);
  const snap = await ref.get();
  if (!snap.exists) {
    throw new NotFoundError(`User ${id} not found`);
  }
  await ref.delete();
}
