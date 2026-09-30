# Shivacha OS — AI Company layer (architecture plan)

This layer **extends** the existing Shivacha OS. It adds an organisation, objectives and delegation on top of the
existing AI runtime; it does not replace any module.

## What already existed (Phase 0 audit) and is reused unchanged

| Existing system | Where | How the AI company uses it |
|---|---|---|
| AI runtime (tool loop, OBSERVE/ASSIST/AUTONOMOUS, approvals, metering) | `lib/ai/runner.ts` | Every AI employee — old and new — runs through `runAgent`. |
| Global execution router | `lib/ai/router/*` | Unchanged. |
| AI employee task engine (plan → progress → complete, pause, cancel, recovery) | `lib/ai/workforce/engine.ts` | Extended with delegation, review, dependencies, escalation and transient-error retry. |
| Human Approval Center | `lib/ai/approvals.ts` | Unchanged; every risky action still becomes an `AIApproval`. |
| Tool registry with RBAC re-check per call | `lib/ai/tools*.ts` | New employees get **subsets** of existing tools plus a few new, permission-checked tools. |
| Employee memory | `lib/ai/workforce/memory.ts` | Extended with company / department / region / entity scopes. |
| Growth department (kill switches, budgets, providers, loop, prospects, sequences, social) | `lib/growth/*` | Lead generation, social and campaigns build on it; kill switches stop the whole AI company. |
| CRM, deals, proposals, projects, finance, support | existing modules | Reached only through existing tools and existing server logic. |
| Insights (stalled deals, overdue invoices, red projects …) | `lib/ai/insights.ts` | High-severity insights are escalated to the responsible AI executive. |
| Integration hub, TOTP encryption helpers | `lib/os/integrations.ts`, `lib/auth/totp.ts` | The credential vault reuses `encryptSecret` (AES-256-GCM, `APP_ENCRYPTION_KEY`). |

Not modified: the 12 core agents in `lib/ai/catalog.ts` (`AGENTS` stays exactly 12), approval semantics, audit
logging, the growth kill switches and budgets, CRM rules (a prospect becomes a lead only when a person converts it).

## New pieces

* `lib/company/org.ts` (pure): departments, regions, levels and ~45 additional AI employees. Existing agents are
  mapped into the hierarchy instead of being duplicated. Each new employee is an `AgentSpec`, so it runs on the same
  runtime with least-privilege tools.
* Additive migration `20260930090000_ai_company`: `AIDepartment`, `AIRegion`, `AIObjective`, `AIWorkMessage`,
  `MarketResearch`, `IntegrationSecret`; nullable columns on `AIAgent`, `AITask`, `AIActivity`,
  `AIEmployeeMemory`, `Prospect`, `Campaign`; enum value `AITaskStatus.WAITING`.
* `lib/company/*`: objectives + playbooks, delegation/review/escalation, lead-generation pipeline, market research,
  regions, performance, briefing, governance, credential vault.
* Routes under `/admin/company/*`, `/admin/marketing/market`, `/admin/marketing/leads`,
  `/admin/marketing/social/calendar`, `/admin/integrations/connect`.

## Safety model

* Delegation only down the org chart (or to peers for help), capped per task, per objective and per day.
* Delegated work runs with the **same human identity** as the objective's creator — permissions never widen.
* Kill switches (`STOP ALL`, `Stop all AI`) stop delegation and execution.
* Strict approval mode forces every AI mutation through the Approval Center.
* External actions (email, publishing) keep their existing approval and provider-confirmation rules.
* When a provider is missing the system stops at that boundary and reports `NOT_CONNECTED` / `NOT_SUPPORTED` /
  `BLOCKED`; nothing is simulated.
