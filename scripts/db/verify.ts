/**
 * Verifies the Prisma ↔ PostgreSQL (Neon) integration against the database in DATABASE_URL.
 *
 *   npm run db:verify
 *
 * Safe for production: it only reads, and runs its create/read/update/delete checks inside a single
 * transaction that is always rolled back. It never resets, drops or migrates anything.
 */
import { readdirSync } from "node:fs";
import { prisma } from "./prisma-node";

const EXPECTED = ["User", "Session", "PasswordResetToken", "LoginAttempt", "Lead", "LeadNote", "LeadActivity", "FollowUp", "Service", "Product", "Page", "PageSection", "BlogPost", "CaseStudy", "Industry", "Technology", "Faq", "Media", "NavigationItem", "SeoEntry", "Redirect", "Setting", "AuditLog"];
const ok = (m: string) => console.log(`  ✔ ${m}`);
const bad = (m: string) => {
  console.log(`  ✘ ${m}`);
  process.exitCode = 1;
};
class Rollback extends Error {}

async function main() {
  const url = new URL(process.env.DATABASE_URL!);
  console.log(`Database host: ${url.hostname} / ${url.pathname.slice(1)} (credentials hidden)\n`);

  console.log("1. Connectivity");
  const [v] = await prisma.$queryRaw<{ version: string; db: string }[]>`SELECT version() AS version, current_database() AS db`;
  ok(`connected to ${v.db}: ${v.version.split(",")[0]}`);

  console.log("\n2. Tables");
  const tables = (await prisma.$queryRaw<{ t: string }[]>`SELECT table_name AS t FROM information_schema.tables WHERE table_schema = 'public'`).map((r) => r.t);
  const missing = EXPECTED.filter((t) => !tables.includes(t));
  const foreign = tables.filter((t) => !EXPECTED.includes(t) && t !== "_prisma_migrations");
  if (missing.length) bad(`missing tables: ${missing.join(", ")}`);
  else ok(`all ${EXPECTED.length} application tables exist`);
  if (foreign.length) console.log(`  ℹ other tables already in this database (left untouched): ${foreign.join(", ")}`);

  console.log("\n3. Migrations");
  const local = readdirSync("prisma/migrations", { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name).sort();
  if (!tables.includes("_prisma_migrations")) {
    bad("no _prisma_migrations table — run `npm run db:migrate:deploy` (safe: applies pending migrations only)");
    if (tables.length) console.log("    The database is not empty; migrate deploy will stop with P3005 instead of changing existing tables. See README → Admin panel → Existing databases.");
  } else {
    const applied = await prisma.$queryRaw<{ migration_name: string; finished_at: Date | null; rolled_back_at: Date | null }[]>`SELECT migration_name, finished_at, rolled_back_at FROM _prisma_migrations ORDER BY started_at`;
    const done = new Set(applied.filter((m) => m.finished_at && !m.rolled_back_at).map((m) => m.migration_name));
    const failed = applied.filter((m) => !m.finished_at && !m.rolled_back_at);
    const pending = local.filter((m) => !done.has(m));
    if (failed.length) bad(`failed migrations: ${failed.map((m) => m.migration_name).join(", ")}`);
    if (pending.length) bad(`pending migrations: ${pending.join(", ")} — run npm run db:migrate:deploy`);
    if (!failed.length && !pending.length) ok(`${local.length} migration(s) applied: ${local.join(", ")}`);
  }
  if (missing.length) return;

  console.log("\n4. Stored data (real rows)");
  const counts = await Promise.all([prisma.user.count(), prisma.user.count({ where: { role: "SUPER_ADMIN", active: true } }), prisma.lead.count(), prisma.service.count(), prisma.product.count(), prisma.page.count(), prisma.blogPost.count(), prisma.caseStudy.count(), prisma.faq.count(), prisma.media.count(), prisma.setting.count(), prisma.auditLog.count()]);
  const labels = ["admin users", "active Super Admins", "leads", "services", "products", "pages", "blog posts", "case studies", "FAQs", "media files", "settings", "audit log entries"];
  labels.forEach((l, i) => console.log(`  • ${l}: ${counts[i]}`));
  if (!counts[1]) console.log("  ℹ no Super Admin yet — run: npm run admin:create -- --email you@shivacha.com --name \"Your Name\"");

  console.log("\n5. Write path (create → read → update → delete, rolled back)");
  const tag = `verify-${Date.now().toString(36)}`;
  try {
    await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({ data: { email: `${tag}@verify.invalid`, name: "Verify", passwordHash: "x", role: "SALES_MANAGER" } });
      const lead = await tx.lead.create({ data: { ref: tag.toUpperCase(), name: "Verify Lead", email: `${tag}@verify.invalid`, source: "verify", assignedToId: user.id } });
      await tx.leadNote.create({ data: { leadId: lead.id, authorId: user.id, body: "note" } });
      await tx.leadActivity.create({ data: { leadId: lead.id, actorId: user.id, type: "CREATED" } });
      await tx.followUp.create({ data: { leadId: lead.id, dueAt: new Date(), assignedToId: user.id } });
      const upd = await tx.lead.update({ where: { id: lead.id }, data: { status: "QUALIFIED", priority: "HIGH" }, include: { notes: true, activities: true, followUps: true, assignedTo: true } });
      if (upd.status !== "QUALIFIED" || upd.notes.length !== 1 || upd.followUps.length !== 1 || upd.assignedTo?.id !== user.id) throw new Error("lead relations did not round-trip");
      ok("lead + note + activity + follow-up + assignment");

      await tx.service.create({ data: { slug: tag, name: "Verify Service", division: "AI", status: "PUBLISHED", features: [{ title: "a", description: "b" }] } });
      await tx.product.create({ data: { slug: tag, name: "Verify Product", division: "FINTECH" } });
      await tx.blogPost.create({ data: { slug: tag, title: "Verify Post", tags: ["x"], status: "PUBLISHED", publishedAt: new Date() } });
      await tx.caseStudy.create({ data: { slug: tag, title: "Verify Case" } });
      await tx.industry.create({ data: { slug: tag, name: "Verify Industry" } });
      await tx.technology.create({ data: { slug: tag, name: "Verify Tech", category: "AI" } });
      await tx.faq.create({ data: { question: "Q?", answer: "A.", serviceSlug: tag } });
      const page = await tx.page.create({ data: { slug: tag, title: "Verify Page", sections: { create: [{ type: "text", data: { title: "t" }, order: 0 }] } }, include: { sections: true } });
      if (page.sections.length !== 1) throw new Error("page sections did not round-trip");
      await tx.media.create({ data: { key: tag, url: `/uploads/${tag}.png`, filename: "v.png", mimeType: "image/png", size: 1 } });
      await tx.navigationItem.create({ data: { menu: "FOOTER", label: "Verify", url: "/", children: { create: [{ menu: "FOOTER", label: "Child", url: "/x" }] } } });
      await tx.seoEntry.create({ data: { path: `/${tag}`, title: "t", noindex: true } });
      await tx.redirect.create({ data: { source: `/${tag}`, destination: "/" } });
      await tx.setting.create({ data: { key: tag, value: { a: 1 } } });
      await tx.auditLog.create({ data: { userId: user.id, action: "verify.run", entity: "verify" } });
      await tx.service.update({ where: { slug: tag }, data: { name: "Verify Service 2" } });
      await tx.service.delete({ where: { slug: tag } });
      ok("services, products, blog, case studies, industries, technologies, FAQs, pages + sections, media, navigation, SEO, redirects, settings, audit log");

      let unique = false;
      try {
        await tx.$executeRawUnsafe(`SAVEPOINT uq`);
        await tx.product.create({ data: { slug: tag, name: "dup", division: "AI" } });
      } catch {
        unique = true;
        await tx.$executeRawUnsafe(`ROLLBACK TO SAVEPOINT uq`);
      }
      if (unique) ok("unique constraints enforced (duplicate slug rejected)");
      else bad("duplicate slug was accepted");

      await tx.user.delete({ where: { id: user.id } });
      const after = await tx.lead.findUnique({ where: { id: lead.id } });
      if (after?.assignedToId !== null) throw new Error("ON DELETE SET NULL not applied");
      ok("foreign keys enforced (deleting a user unassigns their leads)");
      throw new Rollback();
    });
  } catch (e) {
    if (!(e instanceof Rollback)) bad(`write test failed: ${(e as Error).message.split("\n").pop()}`);
    else ok("transaction rolled back — no test data left behind");
  }

  console.log(process.exitCode ? "\nVerification found problems (see ✘ above)." : "\nAll checks passed.");
}

main()
  .catch((e) => {
    console.error("\n✘ Could not verify the database:", (e as Error).message.split("\n").slice(-2).join(" "));
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
