/**
 * Create an admin user from the command line. No password is ever stored in the repository.
 *
 *   npm run admin:create -- --email you@shivacha.com --name "Your Name" [--role SUPER_ADMIN]
 *
 * The password is read from ADMIN_PASSWORD (for CI/one-off use) or prompted for interactively (hidden).
 * --role defaults to SUPER_ADMIN only when no Super Admin exists yet; otherwise it is required.
 */
import { createInterface } from "node:readline";
import bcrypt from "bcryptjs";
import { prisma } from "./prisma-node";
import { ROLES, type RoleName } from "../../lib/auth/permissions";

function arg(name: string) {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : undefined;
}

function problem(pw: string, email: string) {
  if (pw.length < 12) return "Use at least 12 characters.";
  if ([/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((r) => r.test(pw)).length < 3) return "Use a mix of upper/lower case, numbers and symbols.";
  if (pw.toLowerCase().includes(email.split("@")[0].toLowerCase())) return "Do not include the email name in the password.";
  return null;
}

function promptHidden(q: string): Promise<string> {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    const out = rl as unknown as { _writeToOutput: (s: string) => void; output: NodeJS.WriteStream };
    out._writeToOutput = (s: string) => (s.includes(q) ? out.output.write(s) : out.output.write("*"));
    rl.question(q, (a) => {
      rl.close();
      process.stdout.write("\n");
      resolve(a);
    });
  });
}

async function main() {
  const email = arg("email")?.trim().toLowerCase();
  const name = arg("name")?.trim();
  if (!email || !/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(email) || !name) {
    console.error('Usage: npm run admin:create -- --email you@company.com --name "Full Name" [--role SUPER_ADMIN]');
    process.exit(1);
  }
  const superCount = await prisma.user.count({ where: { role: "SUPER_ADMIN", active: true } });
  const role = (arg("role") ?? (superCount === 0 ? "SUPER_ADMIN" : "")) as RoleName;
  if (!ROLES.includes(role)) {
    console.error(`--role is required once a Super Admin exists. One of: ${ROLES.join(", ")}`);
    process.exit(1);
  }
  if (await prisma.user.findUnique({ where: { email } })) {
    console.error(`A user with ${email} already exists. Use the admin panel (Users) to change it.`);
    process.exit(1);
  }
  const password = process.env.ADMIN_PASSWORD ?? (await promptHidden("Password (min 12 chars): "));
  const p = problem(password, email);
  if (p) {
    console.error(`Password rejected: ${p}`);
    process.exit(1);
  }
  const user = await prisma.user.create({ data: { email, name, role, passwordHash: await bcrypt.hash(password, 12) }, select: { id: true, email: true, role: true } });
  await prisma.auditLog.create({ data: { action: "user.created_cli", entity: "User", entityId: user.id, metadata: { email: user.email, role: user.role } } });
  console.log(`Created ${user.role} ${user.email}. Sign in at /admin/login.`);
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
