import { db } from "@/lib/db/client";
import { getSessionUser } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { audit } from "@/lib/audit";
import { downloadResponse } from "@/lib/os/documents";
import { myEmployee } from "@/lib/workforce/access";
import { readHrDocument } from "@/lib/workforce/documents";

export const dynamic = "force-dynamic";

/** HR document download: HR with employeeDocs:view, or the employee themselves for documents shared with them. Audited. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  const { id } = await params;
  const doc = await db.employeeDocument.findUnique({ where: { id } });
  if (!doc) return new Response("Not found", { status: 404 });
  const own = (await myEmployee(user.id))?.id === doc.employeeId && doc.employeeVisible;
  if (!own && !can(user.role, "employeeDocs:view")) {
    await audit({ userId: user.id, action: "employee.document.denied", entity: "EmployeeDocument", entityId: id });
    return new Response("Forbidden", { status: 403 });
  }
  try {
    const buf = await readHrDocument(doc.storageKey);
    await audit({ userId: user.id, action: "employee.document.viewed", entity: "EmployeeDocument", entityId: id, metadata: { employeeId: doc.employeeId, kind: doc.kind, self: own } });
    return downloadResponse(buf, doc, new URL(req.url).searchParams.get("inline") === "1");
  } catch (e) {
    console.error("[hr-docs] read failed", (e as Error).message);
    return new Response("The file could not be read.", { status: 502 });
  }
}
