export const EMPLOYMENT_TYPES = ["FULL_TIME", "PART_TIME", "INTERN", "FREELANCER", "CONTRACTOR", "CONSULTANT"] as const;
export const EMPLOYMENT_STATUSES = ["ACTIVE", "PROBATION", "ON_LEAVE", "NOTICE_PERIOD", "SUSPENDED", "RESIGNED", "TERMINATED", "INACTIVE"] as const;
export const WORK_MODES = ["OFFICE", "REMOTE", "HYBRID"] as const;
export const LEAVE_STATUSES = ["PENDING_MANAGER", "PENDING_HR", "APPROVED", "REJECTED", "CANCELLED"] as const;
export const REVIEW_PERIODS = ["MONTHLY", "QUARTERLY", "HALF_YEAR", "ANNUAL"] as const;
export const REVIEW_STATUSES = ["SELF_REVIEW", "MANAGER_REVIEW", "HR_REVIEW", "FINALIZED"] as const;
export const GOAL_STATUSES = ["NOT_STARTED", "ON_TRACK", "AT_RISK", "OFF_TRACK", "ACHIEVED", "CANCELLED"] as const;
export const WEEKDAYS: [number, string][] = [[1, "Mon"], [2, "Tue"], [3, "Wed"], [4, "Thu"], [5, "Fri"], [6, "Sat"], [7, "Sun"]];
