import { can, type RoleName } from "@/lib/auth/permissions";

/**
 * Objective visibility follows the existing AI task rule: the person who set it, AI administrators and executives.
 * (Executives run the company; everyone else sees only their own objectives.)
 */
export const seesAllObjectives = (role: RoleName) => can(role, "ai:configure") || can(role, "executive:view");
export const objectiveScope = (user: { id: string; role: RoleName }) => (seesAllObjectives(user.role) ? {} : { createdById: user.id });
