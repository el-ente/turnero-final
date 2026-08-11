import type {AppUser} from "./models/user";
import {UNSCOPED_ROLES} from "./models/user";

// True if the user can operate a terminal in this sector: admin/supervisor
// see every sector, a cashier only the ones they've been assigned.
// Shared between the client (terminal picker UI) and the server (the real
// enforcement point) so the two never drift.
export function canAccessSector(user: Pick<AppUser, "role" | "assignedSectorIds">, sectorId: string): boolean {
  return UNSCOPED_ROLES.includes(user.role) || user.assignedSectorIds.includes(sectorId);
}

export function canAccessTerminal(
  user: Pick<AppUser, "role" | "assignedSectorIds">,
  terminal: {sectorIds: string[]}
): boolean {
  return UNSCOPED_ROLES.includes(user.role) || terminal.sectorIds.some((id) => canAccessSector(user, id));
}
