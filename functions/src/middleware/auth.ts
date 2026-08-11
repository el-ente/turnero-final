import {onRequest} from "firebase-functions/v2/https";
import {AppUser, UserRole, UserStatus} from "shared";
import {auth, logger} from "../config/firebase-admin";
import {getUserByUid} from "../services/userService";
import {UnauthorizedError, ForbiddenError} from "../utils/errors";

// Pulled from onRequest's own signature so we match its Request/Response
// types exactly without taking a direct (and version-mismatched) dependency
// on @types/express ourselves.
type OnRequestHandler = Parameters<typeof onRequest>[0];
type Request = Parameters<OnRequestHandler>[0];
type Response = Parameters<OnRequestHandler>[1];

// Verifies the bearer token and loads the matching active users/{uid} doc.
// Throws UnauthorizedError if the token is missing/invalid or no active
// account exists yet (e.g. still pending an admin's invite).
export async function authenticate(req: Request): Promise<AppUser> {
  const header = req.headers.authorization || "";
  const match = header.match(/^Bearer (.+)$/);
  if (!match) {
    throw new UnauthorizedError("Missing Authorization header");
  }

  let decoded;
  try {
    decoded = await auth.verifyIdToken(match[1]);
  } catch {
    throw new UnauthorizedError("Invalid or expired token");
  }

  const appUser = await getUserByUid(decoded.uid);
  if (!appUser) {
    throw new UnauthorizedError("No account provisioned for this user");
  }
  if (appUser.status !== UserStatus.ACTIVE) {
    throw new UnauthorizedError("Account is pending activation");
  }

  return appUser;
}

// Verifies the bearer token only, without requiring a users/{uid} doc to
// already exist. Used solely by the bootstrap endpoint, which is what
// creates that doc on a person's first sign-in.
export async function verifyToken(req: Request): Promise<{uid: string; email: string; displayName?: string}> {
  const header = req.headers.authorization || "";
  const match = header.match(/^Bearer (.+)$/);
  if (!match) {
    throw new UnauthorizedError("Missing Authorization header");
  }

  try {
    const decoded = await auth.verifyIdToken(match[1]);
    if (!decoded.email) {
      throw new UnauthorizedError("Token has no associated email");
    }
    return {uid: decoded.uid, email: decoded.email, displayName: decoded.name};
  } catch (error) {
    if (error instanceof UnauthorizedError) throw error;
    throw new UnauthorizedError("Invalid or expired token");
  }
}

export function hasRole(user: AppUser, ...roles: UserRole[]): boolean {
  return roles.includes(user.role);
}

type Handler = (req: Request, res: Response) => Promise<void>;
type AuthedHandler = (req: Request, res: Response, user: AppUser) => Promise<void>;

function sendAuthError(res: Response, error: unknown) {
  if (error instanceof UnauthorizedError || error instanceof ForbiddenError) {
    res.status(error.statusCode).json({error: error.message, code: error.code});
    return true;
  }
  return false;
}

// Wraps a handler so it only runs for signed-in users holding one of `roles`
// (no roles given = any authenticated, active account). On failure it writes
// the 401/403 response itself and returns without calling `handler`.
export function requireRole(roles: UserRole[], handler: AuthedHandler): Handler {
  return async (req, res) => {
    try {
      const user = await authenticate(req);
      if (roles.length > 0 && !hasRole(user, ...roles)) {
        throw new ForbiddenError(`Requires one of roles: ${roles.join(", ")}`);
      }
      await handler(req, res, user);
    } catch (error) {
      if (!sendAuthError(res, error)) {
        logger.error("Unexpected error in requireRole:", error);
        res.status(500).json({error: "Internal server error"});
      }
    }
  };
}
