const HREF: Record<string, (id: string) => string> = {
  Lead: (id) => `/admin/leads/${id}`,
  Deal: (id) => `/admin/deals/${id}`,
  Proposal: (id) => `/admin/proposals/${id}`,
  Invoice: (id) => `/admin/finance/invoices/${id}`,
  Payment: (id) => `/admin/finance/payments/${id}`,
  Ticket: (id) => `/admin/support/${id}`,
  Project: (id) => `/admin/projects/${id}`,
  Client: (id) => `/admin/clients/${id}`,
  FollowUp: () => `/admin/follow-ups`,
};
/** Admin URL for an entity reference (shared by automations, AI and notifications). */
export const hrefFor = (r: { entity: string; entityId: string }) => HREF[r.entity]?.(r.entityId);
