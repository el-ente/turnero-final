import {authenticate, verifyToken, requireRole} from "../middleware/auth";
import {auth, db} from "../config/firebase-admin";
import {UnauthorizedError} from "../utils/errors";
import {UserRole, UserStatus, AppUser, canAccessSector, canAccessTerminal} from "shared";

jest.mock("../config/firebase-admin");

function mockUserDoc(uid: string, data: Record<string, unknown> | null) {
  (db.collection as jest.Mock).mockImplementation((name: string) => {
    if (name !== "users") throw new Error(`Unexpected collection: ${name}`);
    return {
      doc: jest.fn().mockReturnValue({
        get: jest.fn().mockResolvedValue(
          data ? {exists: true, id: uid, data: () => data} : {exists: false}
        ),
      }),
    };
  });
}

function req(headers: Record<string, string> = {}, extra: Record<string, unknown> = {}) {
  return {headers, body: {}, query: {}, method: "POST", ...extra} as any;
}

function res() {
  const r: any = {};
  r.status = jest.fn().mockReturnValue(r);
  r.json = jest.fn().mockReturnValue(r);
  r.send = jest.fn().mockReturnValue(r);
  return r;
}

describe("authenticate", () => {
  beforeEach(() => jest.clearAllMocks());

  it("rejects when there is no Authorization header", async () => {
    await expect(authenticate(req())).rejects.toThrow(UnauthorizedError);
  });

  it("rejects a malformed Authorization header", async () => {
    await expect(authenticate(req({authorization: "Basic abc"}))).rejects.toThrow(UnauthorizedError);
  });

  it("rejects when verifyIdToken fails", async () => {
    (auth.verifyIdToken as jest.Mock).mockRejectedValue(new Error("bad token"));
    await expect(authenticate(req({authorization: "Bearer xyz"}))).rejects.toThrow(UnauthorizedError);
  });

  it("rejects when no users/{uid} doc exists", async () => {
    (auth.verifyIdToken as jest.Mock).mockResolvedValue({uid: "u1", email: "a@b.com"});
    mockUserDoc("u1", null);
    await expect(authenticate(req({authorization: "Bearer xyz"}))).rejects.toThrow(UnauthorizedError);
  });

  it("rejects a pending (not yet activated) account", async () => {
    (auth.verifyIdToken as jest.Mock).mockResolvedValue({uid: "u1", email: "a@b.com"});
    mockUserDoc("u1", {
      email: "a@b.com", role: UserRole.CASHIER, assignedSectorIds: [], status: UserStatus.PENDING,
      createdAt: new Date(), updatedAt: new Date(),
    });
    await expect(authenticate(req({authorization: "Bearer xyz"}))).rejects.toThrow(UnauthorizedError);
  });

  it("returns the AppUser for an active account", async () => {
    (auth.verifyIdToken as jest.Mock).mockResolvedValue({uid: "u1", email: "a@b.com"});
    mockUserDoc("u1", {
      email: "a@b.com", role: UserRole.CASHIER, assignedSectorIds: ["sector-1"], status: UserStatus.ACTIVE,
      createdAt: new Date(), updatedAt: new Date(),
    });
    const user = await authenticate(req({authorization: "Bearer xyz"}));
    expect(user).toMatchObject({id: "u1", role: UserRole.CASHIER, assignedSectorIds: ["sector-1"]});
  });
});

describe("verifyToken", () => {
  beforeEach(() => jest.clearAllMocks());

  it("rejects when there is no Authorization header", async () => {
    await expect(verifyToken(req())).rejects.toThrow(UnauthorizedError);
  });

  it("rejects a token with no email claim", async () => {
    (auth.verifyIdToken as jest.Mock).mockResolvedValue({uid: "u1"});
    await expect(verifyToken(req({authorization: "Bearer xyz"}))).rejects.toThrow(UnauthorizedError);
  });

  it("returns uid/email/displayName without touching Firestore", async () => {
    (auth.verifyIdToken as jest.Mock).mockResolvedValue({uid: "u1", email: "a@b.com", name: "Ana"});
    const result = await verifyToken(req({authorization: "Bearer xyz"}));
    expect(result).toEqual({uid: "u1", email: "a@b.com", displayName: "Ana"});
    expect(db.collection).not.toHaveBeenCalled();
  });
});

describe("canAccessSector / canAccessTerminal", () => {
  const cashier: AppUser = {
    id: "u1", email: "a@b.com", role: UserRole.CASHIER, assignedSectorIds: ["sector-a"],
    status: UserStatus.ACTIVE, createdAt: new Date(), updatedAt: new Date(),
  };

  it("cashier can access only their assigned sector", () => {
    expect(canAccessSector(cashier, "sector-a")).toBe(true);
    expect(canAccessSector(cashier, "sector-b")).toBe(false);
  });

  it("cashier can access a terminal if any of its sectors is assigned to them", () => {
    expect(canAccessTerminal(cashier, {sectorIds: ["sector-b", "sector-a"]})).toBe(true);
    expect(canAccessTerminal(cashier, {sectorIds: ["sector-b"]})).toBe(false);
  });

  it("admin and supervisor bypass sector assignment entirely", () => {
    const admin: AppUser = {...cashier, role: UserRole.ADMIN, assignedSectorIds: []};
    const supervisor: AppUser = {...cashier, role: UserRole.SUPERVISOR, assignedSectorIds: []};
    expect(canAccessSector(admin, "sector-z")).toBe(true);
    expect(canAccessTerminal(supervisor, {sectorIds: ["sector-z"]})).toBe(true);
  });
});

describe("requireRole", () => {
  beforeEach(() => jest.clearAllMocks());

  it("responds 401 and never calls the handler when unauthenticated", async () => {
    const inner = jest.fn();
    const wrapped = requireRole([UserRole.ADMIN], inner);
    const response = res();

    await wrapped(req(), response);

    expect(response.status).toHaveBeenCalledWith(401);
    expect(inner).not.toHaveBeenCalled();
  });

  it("responds 403 when the account doesn't hold a required role", async () => {
    (auth.verifyIdToken as jest.Mock).mockResolvedValue({uid: "u1", email: "a@b.com"});
    mockUserDoc("u1", {
      email: "a@b.com", role: UserRole.CASHIER, assignedSectorIds: [], status: UserStatus.ACTIVE,
      createdAt: new Date(), updatedAt: new Date(),
    });
    const inner = jest.fn();
    const wrapped = requireRole([UserRole.ADMIN], inner);
    const response = res();

    await wrapped(req({authorization: "Bearer xyz"}), response);

    expect(response.status).toHaveBeenCalledWith(403);
    expect(inner).not.toHaveBeenCalled();
  });

  it("calls the handler with the resolved AppUser when authorized", async () => {
    (auth.verifyIdToken as jest.Mock).mockResolvedValue({uid: "u1", email: "a@b.com"});
    mockUserDoc("u1", {
      email: "a@b.com", role: UserRole.ADMIN, assignedSectorIds: [], status: UserStatus.ACTIVE,
      createdAt: new Date(), updatedAt: new Date(),
    });
    const inner = jest.fn().mockResolvedValue(undefined);
    const wrapped = requireRole([UserRole.ADMIN], inner);
    const response = res();
    const request = req({authorization: "Bearer xyz"});

    await wrapped(request, response);

    expect(inner).toHaveBeenCalledWith(request, response, expect.objectContaining({role: UserRole.ADMIN}));
  });

  it("allows any authenticated role when none is specified", async () => {
    (auth.verifyIdToken as jest.Mock).mockResolvedValue({uid: "u1", email: "a@b.com"});
    mockUserDoc("u1", {
      email: "a@b.com", role: UserRole.CASHIER, assignedSectorIds: [], status: UserStatus.ACTIVE,
      createdAt: new Date(), updatedAt: new Date(),
    });
    const inner = jest.fn().mockResolvedValue(undefined);
    const wrapped = requireRole([], inner);

    await wrapped(req({authorization: "Bearer xyz"}), res());

    expect(inner).toHaveBeenCalled();
  });
});
