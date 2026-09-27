import { ROLE_LABELS, ROLE_PERMISSIONS, type RoleName } from "@/lib/auth/permissions";
import { inputCls, labelCls } from "@/components/admin/ui";
import { FieldError } from "@/components/admin/forms";

export function UserFields({ user, roles, isNew }: { user?: { name: string; email: string; role: RoleName; active: boolean }; roles: RoleName[]; isNew?: boolean }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div>
        <label className={labelCls} htmlFor="u-name">Full name</label>
        <input id="u-name" name="name" defaultValue={user?.name} autoComplete="off" className={inputCls} />
        <FieldError name="name" />
      </div>
      <div>
        <label className={labelCls} htmlFor="u-email">Email</label>
        <input id="u-email" name="email" type="email" defaultValue={user?.email} autoComplete="off" className={inputCls} />
        <FieldError name="email" />
      </div>
      <div>
        <label className={labelCls} htmlFor="u-role">Role</label>
        <select id="u-role" name="role" defaultValue={user?.role ?? "CONTENT_MANAGER"} className={inputCls}>
          {roles.map((r) => (
            <option key={r} value={r}>{ROLE_LABELS[r]}</option>
          ))}
        </select>
        <FieldError name="role" />
      </div>
      {isNew ? (
        <div>
          <label className={labelCls} htmlFor="u-pw">Temporary password</label>
          <input id="u-pw" name="password" type="password" autoComplete="new-password" className={inputCls} />
          <p className="mt-1 text-xs text-dim">12+ characters with upper, lower, number or symbol. Share it securely; the user can reset it via “Forgot password”.</p>
          <FieldError name="password" />
        </div>
      ) : (
        <label className="flex items-center gap-2 self-end pb-2 text-sm text-fg">
          <input type="checkbox" name="active" defaultChecked={user?.active} className="size-4" /> Account active
        </label>
      )}
      <details className="sm:col-span-2">
        <summary className="cursor-pointer text-xs text-muted">What can each role do?</summary>
        <dl className="mt-2 grid gap-2 text-xs sm:grid-cols-2">
          {roles.map((r) => (
            <div key={r}>
              <dt className="font-medium text-fg">{ROLE_LABELS[r]}</dt>
              <dd className="text-dim">{ROLE_PERMISSIONS[r].join(", ")}</dd>
            </div>
          ))}
        </dl>
      </details>
    </div>
  );
}
