export const UserRole = {
  ADMIN: "admin",
  SUPERVISOR: "supervisor",
  CASHIER: "cashier",
} as const;

export type UserRole = typeof UserRole[keyof typeof UserRole];

export const UserStatus = {
  // Invited by an admin (by email) but hasn't signed in with that email yet.
  PENDING: "pending",
  ACTIVE: "active",
} as const;

export type UserStatus = typeof UserStatus[keyof typeof UserStatus];

// Roles that see/operate every sector regardless of assignedSectorIds.
export const UNSCOPED_ROLES: UserRole[] = [UserRole.ADMIN, UserRole.SUPERVISOR];

export interface AppUser {
  id: string; // Firestore doc id: the Firebase Auth uid once active, an auto id while pending
  uid?: string; // set once the invited person signs in with Google
  email: string;
  displayName?: string;
  role: UserRole;
  // Sectors this user can operate terminals in. Ignored for admin/supervisor (see UNSCOPED_ROLES).
  assignedSectorIds: string[];
  status: UserStatus;
  createdAt: Date;
  updatedAt: Date;
}
