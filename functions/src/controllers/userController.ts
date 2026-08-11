import {onRequest} from "firebase-functions/v2/https";
import {UserRole} from "shared";
import {bootstrapUser, listUsers, inviteUser, updateUserRole, deleteUser} from "../services/userService";
import {requireRole, verifyToken} from "../middleware/auth";
import {BusinessError, UnauthorizedError} from "../utils/errors";
import {logger} from "../config/firebase-admin";

function handleError(res: any, error: unknown) {
  if (error instanceof BusinessError) {
    res.status(error.statusCode).json({error: error.message, code: error.code});
  } else {
    logger.error("Internal error:", error);
    res.status(500).json({error: "Internal server error"});
  }
}

// Called by the frontend right after a successful Google Sign-In. Not
// wrapped in requireRole since the users/{uid} doc this creates doesn't
// exist yet on a person's very first login.
export const bootstrapUserHandler = onRequest({cors: true}, async (req, res) => {
  try {
    if (req.method !== "POST") {
      res.status(405).json({error: "Method not allowed"}); return;
    }
    const {uid, email, displayName} = await verifyToken(req);
    const user = await bootstrapUser(uid, email, displayName);
    res.status(200).json(user);
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      res.status(error.statusCode).json({error: error.message, code: error.code});
      return;
    }
    handleError(res, error);
  }
});

export const listUsersHandler = onRequest({cors: true}, requireRole([UserRole.ADMIN], async (req, res) => {
  if (req.method !== "GET") {
    res.status(405).json({error: "Method not allowed"}); return;
  }
  try {
    const users = await listUsers();
    res.status(200).json(users);
  } catch (error) {
    handleError(res, error);
  }
}));

export const inviteUserHandler = onRequest({cors: true}, requireRole([UserRole.ADMIN], async (req, res) => {
  if (req.method !== "POST") {
    res.status(405).json({error: "Method not allowed"}); return;
  }
  try {
    const {email, role, assignedSectorIds} = req.body;
    const user = await inviteUser({email, role, assignedSectorIds});
    res.status(201).json(user);
  } catch (error) {
    handleError(res, error);
  }
}));

export const updateUserRoleHandler = onRequest({cors: true}, requireRole([UserRole.ADMIN], async (req, res) => {
  if (req.method !== "PUT") {
    res.status(405).json({error: "Method not allowed"}); return;
  }
  const {userId} = req.query;
  if (!userId || typeof userId !== "string") {
    res.status(400).json({error: "userId query parameter is required"}); return;
  }
  try {
    const {role, assignedSectorIds, status} = req.body;
    const user = await updateUserRole(userId, {role, assignedSectorIds, status});
    res.status(200).json(user);
  } catch (error) {
    handleError(res, error);
  }
}));

export const deleteUserHandler = onRequest({cors: true}, requireRole([UserRole.ADMIN], async (req, res) => {
  if (req.method !== "DELETE") {
    res.status(405).json({error: "Method not allowed"}); return;
  }
  const {userId} = req.query;
  if (!userId || typeof userId !== "string") {
    res.status(400).json({error: "userId query parameter is required"}); return;
  }
  try {
    await deleteUser(userId);
    res.status(204).send();
  } catch (error) {
    handleError(res, error);
  }
}));
