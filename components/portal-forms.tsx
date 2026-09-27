"use client";

import Link from "next/link";
import { useEffect, useRef, type ReactNode } from "react";
import { portalForgotAction, portalLoginAction, setPortalPasswordAction, type PortalFormState } from "@/lib/portal/auth-actions";
import { SubmitButton } from "@/components/admin/client";
import { FormPendingContext, useFormAction } from "@/components/admin/forms";
import { inputCls, labelCls } from "@/components/admin/ui";

function Msg({ s }: { s: PortalFormState }) {
  if (!s) return null;
  return s.error ? <p role="alert" className="rounded-md border border-red-500/30 bg-red-500/5 px-3 py-2 text-sm text-red-700">{s.error}</p> : s.ok ? <p role="status" className="rounded-md border border-emerald-500/30 bg-emerald-500/5 px-3 py-2 text-sm text-emerald-800">{s.ok}</p> : null;
}

function Shell({ action, children, after }: { action: (s: PortalFormState, f: FormData) => Promise<PortalFormState>; children: ReactNode; after?: (s: PortalFormState) => ReactNode }) {
  const [state, onSubmit, pending] = useFormAction(action);
  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <FormPendingContext.Provider value={pending}>
        <Msg s={state} />
        {children}
        {after?.(state)}
      </FormPendingContext.Provider>
    </form>
  );
}

export function PortalLoginForm() {
  return (
    <Shell action={portalLoginAction}>
      <h1 className="text-xl font-semibold tracking-tight text-fg">Sign in to your portal</h1>
      <div>
        <label htmlFor="email" className={labelCls}>Email</label>
        <input id="email" name="email" type="email" autoComplete="username" required className={inputCls} />
      </div>
      <div>
        <div className="mb-1 flex items-baseline justify-between">
          <label htmlFor="password" className="text-[12.5px] font-medium text-fg">Password</label>
          <Link href="/client/forgot-password" className="text-xs text-muted hover:text-fg">Forgot password?</Link>
        </div>
        <input id="password" name="password" type="password" autoComplete="current-password" required className={inputCls} />
      </div>
      <SubmitButton className="w-full">Sign in</SubmitButton>
      <p className="text-xs text-dim">Access is by invitation from your Shivacha account manager.</p>
    </Shell>
  );
}

export function PortalSetPasswordForm({ token }: { token: string }) {
  return (
    <Shell action={setPortalPasswordAction} after={(s) => (s?.ok ? <Link href="/client/login" className="btn-primary h-9 w-full px-3.5 text-[13px]">Go to sign in</Link> : null)}>
      <h1 className="text-xl font-semibold tracking-tight text-fg">Set your password</h1>
      <p className="text-sm text-muted">At least 12 characters with a mix of letters, numbers and symbols.</p>
      <input type="hidden" name="token" value={token} />
      <div>
        <label htmlFor="password" className={labelCls}>New password</label>
        <input id="password" name="password" type="password" autoComplete="new-password" required minLength={12} className={inputCls} />
      </div>
      <div>
        <label htmlFor="confirm" className={labelCls}>Confirm password</label>
        <input id="confirm" name="confirm" type="password" autoComplete="new-password" required className={inputCls} />
      </div>
      <SubmitButton className="w-full">Set password</SubmitButton>
    </Shell>
  );
}

export function PortalForgotForm() {
  return (
    <Shell action={portalForgotAction}>
      <h1 className="text-xl font-semibold tracking-tight text-fg">Reset password</h1>
      <div>
        <label htmlFor="email" className={labelCls}>Email</label>
        <input id="email" name="email" type="email" autoComplete="username" required className={inputCls} />
      </div>
      <SubmitButton className="w-full">Send reset link</SubmitButton>
      <Link href="/client/login" className="block text-center text-sm text-muted hover:text-fg">Back to sign in</Link>
    </Shell>
  );
}

/** Generic portal action form: inline message + optional redirect; resets after success when asked. */
type PState = { error?: string; ok?: string; redirect?: string } | undefined;
export function PortalForm({ action, children, className, resetOnOk }: { action: (s: PState, f: FormData) => Promise<PState>; children: ReactNode; className?: string; resetOnOk?: boolean }) {
  const [state, onSubmit, pending] = useFormAction(action);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state?.redirect) window.location.assign(state.redirect);
    else if (state?.ok && resetOnOk) ref.current?.reset();
  }, [state, resetOnOk]);
  return (
    <form ref={ref} onSubmit={onSubmit} className={className} aria-busy={pending}>
      <FormPendingContext.Provider value={pending}>
        <Msg s={state} />
        {children}
      </FormPendingContext.Provider>
    </form>
  );
}
