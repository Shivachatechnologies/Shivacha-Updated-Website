import "server-only";
import { processDueTasks } from "./workforce/engine";

/**
 * Runs queued AI tasks (from automations, people or recurring responsibilities) through the AI employee task engine.
 * A task runs with its requester's permissions; recurring tasks run as the automation's creator, and tasks with no
 * person behind them run as the system identity, which can read but must send every change to the Human Approval
 * Center.
 */
export async function processTasks(limit = 5): Promise<number> {
  return processDueTasks(limit);
}
