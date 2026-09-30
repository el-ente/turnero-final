import {setGlobalOptions} from "firebase-functions";
import {createTurnHandler, getCurrentTurnHandler, cancelTurnHandler} from "./controllers/turnController";
import {
  nextTurnHandler,
  callTurnHandler,
  startTurnHandler,
  finishTurnHandler,
  recallTurnHandler,
  noShowHandler,
  reassignTerminalQueuesHandler,
  setTerminalStatusHandler,
} from "./controllers/terminalController";
import {
  getQueueStatsHandler, getSectorStatsHandler, getTerminalStatsHandler, getQueueDailyStatsHandler,
  getHourlyStatsHandler, backfillDailyStatsHandler,
  createSectorHandler, listSectorsHandler, updateSectorHandler, deleteSectorHandler,
  createQueueHandler, listQueuesHandler, updateQueueHandler, deleteQueueHandler,
  createTerminalHandler, listTerminalsHandler, updateTerminalHandler, deleteTerminalHandler,
} from "./controllers/adminController";
import {dailyStatsRollupHandler} from "./controllers/scheduledController";
import {
  bootstrapUserHandler, listUsersHandler, inviteUserHandler, updateUserRoleHandler, deleteUserHandler,
} from "./controllers/userController";
import {
  createAppointmentHandler, getAvailableSlotsHandler, getAppointmentHandler,
  cancelAppointmentHandler, rescheduleAppointmentHandler,
} from "./controllers/appointmentController";
import {
  callAppointmentHandler, recallAppointmentHandler, startAppointmentHandler,
  finishAppointmentHandler, noShowAppointmentHandler, getAppointmentsByDateHandler,
} from "./controllers/appointmentStaffController";
import {
  createAppointmentServiceHandler, listAppointmentServicesHandler, updateAppointmentServiceHandler,
  createAppointmentBlockHandler, listAppointmentBlocksHandler, deleteAppointmentBlockHandler,
  previewAppointmentBlockImpactHandler,
} from "./controllers/appointmentAdminController";

setGlobalOptions({maxInstances: 10});

// Turn endpoints
export const createTurn = createTurnHandler;
export const getCurrentTurn = getCurrentTurnHandler;
export const cancelTurn = cancelTurnHandler;

// Terminal endpoints
export const nextTurn = nextTurnHandler;
export const callTurn = callTurnHandler;
export const startTurn = startTurnHandler;
export const finishTurn = finishTurnHandler;
export const recallTurn = recallTurnHandler;
export const noShow = noShowHandler;
export const reassignTerminalQueues = reassignTerminalQueuesHandler;
export const setTerminalStatus = setTerminalStatusHandler;

// Admin endpoints
export const getQueueStats = getQueueStatsHandler;
export const getSectorStats = getSectorStatsHandler;
export const getTerminalStats = getTerminalStatsHandler;
export const getQueueDailyStats = getQueueDailyStatsHandler;
export const getHourlyStats = getHourlyStatsHandler;
export const backfillDailyStats = backfillDailyStatsHandler;

// Scheduled jobs
export const dailyStatsRollup = dailyStatsRollupHandler;

// CRUD — Sectors
export const createSector = createSectorHandler;
export const listSectors = listSectorsHandler;
export const updateSector = updateSectorHandler;
export const deleteSector = deleteSectorHandler;

// CRUD — Queues
export const createQueue = createQueueHandler;
export const listQueues = listQueuesHandler;
export const updateQueue = updateQueueHandler;
export const deleteQueue = deleteQueueHandler;

// CRUD — Terminals
export const createTerminal = createTerminalHandler;
export const listTerminals = listTerminalsHandler;
export const updateTerminal = updateTerminalHandler;
export const deleteTerminal = deleteTerminalHandler;

// Users / auth
export const bootstrapUser = bootstrapUserHandler;
export const listUsers = listUsersHandler;
export const inviteUser = inviteUserHandler;
export const updateUserRole = updateUserRoleHandler;
export const deleteUser = deleteUserHandler;

// Agenda endpoints — independent module, see docs/turnos-agendados-spec-2026-09-25.md
export const createAppointment = createAppointmentHandler;
export const getAvailableSlots = getAvailableSlotsHandler;
export const getAppointment = getAppointmentHandler;
export const cancelAppointment = cancelAppointmentHandler;
export const rescheduleAppointment = rescheduleAppointmentHandler;

// Agenda — staff ("Agenda del día")
export const callAppointment = callAppointmentHandler;
export const recallAppointment = recallAppointmentHandler;
export const startAppointment = startAppointmentHandler;
export const finishAppointment = finishAppointmentHandler;
export const noShowAppointment = noShowAppointmentHandler;
export const getAppointmentsByDate = getAppointmentsByDateHandler;

// Agenda — admin config (Servicio / Bloqueo)
export const createAppointmentService = createAppointmentServiceHandler;
export const listAppointmentServices = listAppointmentServicesHandler;
export const updateAppointmentService = updateAppointmentServiceHandler;
export const createAppointmentBlock = createAppointmentBlockHandler;
export const listAppointmentBlocks = listAppointmentBlocksHandler;
export const deleteAppointmentBlock = deleteAppointmentBlockHandler;
export const previewAppointmentBlockImpact = previewAppointmentBlockImpactHandler;
