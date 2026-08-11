// Every staff/admin endpoint must reject unauthenticated requests. This test
// iterates the actual exported handlers so a future endpoint that forgets to
// wrap itself in requireRole() fails loudly here instead of shipping open.
//
// onRequest() itself is mocked to just hand back the wrapped handler as-is
// (skipping its real CORS/tracing middleware, which needs a full Express
// req/res) - what we actually want to verify is that every handler was
// built by requireRole(), not that Express plumbing works.
jest.mock("firebase-functions/v2/https", () => ({
  onRequest: (optsOrHandler: unknown, handler?: unknown) => handler ?? optsOrHandler,
}));

import * as terminalController from "../controllers/terminalController";
import * as adminController from "../controllers/adminController";
import * as userController from "../controllers/userController";
import {db} from "../config/firebase-admin";

jest.mock("../config/firebase-admin");

function req() {
  return {headers: {}, body: {}, query: {}, method: "POST"} as any;
}

function res() {
  const r: any = {};
  r.status = jest.fn().mockReturnValue(r);
  r.json = jest.fn().mockReturnValue(r);
  r.send = jest.fn().mockReturnValue(r);
  return r;
}

const GATED_HANDLERS: Record<string, (req: any, res: any) => void | Promise<void>> = {
  "terminal.nextTurn": terminalController.nextTurnHandler,
  "terminal.callTurn": terminalController.callTurnHandler,
  "terminal.startTurn": terminalController.startTurnHandler,
  "terminal.finishTurn": terminalController.finishTurnHandler,
  "terminal.recallTurn": terminalController.recallTurnHandler,
  "terminal.noShow": terminalController.noShowHandler,
  "admin.getQueueStats": adminController.getQueueStatsHandler,
  "admin.createSector": adminController.createSectorHandler,
  "admin.listSectors": adminController.listSectorsHandler,
  "admin.updateSector": adminController.updateSectorHandler,
  "admin.deleteSector": adminController.deleteSectorHandler,
  "admin.createQueue": adminController.createQueueHandler,
  "admin.listQueues": adminController.listQueuesHandler,
  "admin.updateQueue": adminController.updateQueueHandler,
  "admin.deleteQueue": adminController.deleteQueueHandler,
  "admin.createTerminal": adminController.createTerminalHandler,
  "admin.listTerminals": adminController.listTerminalsHandler,
  "admin.updateTerminal": adminController.updateTerminalHandler,
  "admin.deleteTerminal": adminController.deleteTerminalHandler,
  "user.list": userController.listUsersHandler,
  "user.invite": userController.inviteUserHandler,
  "user.updateRole": userController.updateUserRoleHandler,
  "user.delete": userController.deleteUserHandler,
};

describe("every staff/admin handler requires auth", () => {
  beforeEach(() => jest.clearAllMocks());

  it.each(Object.entries(GATED_HANDLERS))("%s -> 401 with no Authorization header", async (_name, handler) => {
    const response = res();
    await handler(req(), response);
    expect(response.status).toHaveBeenCalledWith(401);
    expect(db.collection).not.toHaveBeenCalled();
  });
});
