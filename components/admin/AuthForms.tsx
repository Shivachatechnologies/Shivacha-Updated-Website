"use client";

import Link from "next/link";
import { loginAction, requestPasswordResetAction, resetPasswordAction, type FormState } from "@/lib/auth/actions";
import { SubmitButton } from "./client";
import { inputCls, labelCls } from "./ui";
import { FormPendingContext, useFormAction } from "./forms";

function Message({ state }: { state: FormState }) {
  if (!state) return null;
  return state.error ? (
    <p role="alert" className="rounded-md border border-red-500/30 bg-red-500/5 px-3 py-2 text-sm text-red-700">
      {state.error}
    </p>
  ) : state.ok ? (
    <p role="status" className="rounded-md border border-emerald-500/30 bg-emerald-500/5 px-3 py-2 text-sm text-emerald-800">
      {state.ok}
    </p>
  ) : null;
}

export function LoginForm({ next }: { next?: string }) {
  const [state, onSubmit, pending] = useFormAction(loginAction);
  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <FormPendingContext.Provider value={pending}>
      <h1 className="text-xl font-semibold tracking-tight text-fg">Sign in</h1>
      <Message state={state} />
      <input type="hidden" name="next" value={next ?? ""} />
      <div>
        <label htmlFor="email" className={labelCls}>Email</label>
        <input id="email" name="email" type="email" autoComplete="username" required className={inputCls} />
      </div>
      <div>
        <div className="mb-1 flex items-baseline justify-between">
          <label htmlFor="password" className="text-[12.5px] font-medium text-fg">Password</label>
          <Link href="/admin/forgot-password" className="text-xs text-muted hover:text-fg">Forgot password?</Link>
        </div>
        <input id="password" name="password" type="password" autoComplete="current-password" required className={inputCls} />
      </div>
      {state?.twoFactor && (
        <div>
          <label htmlFor="code" className={labelCls}>Authentication code</label>
          <input id="code" name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9 ]*" maxLength={7} required autoFocus className={inputCls} />
        </div>
      )}
      <SubmitButton className="w-full">Sign in</SubmitButton>
      </FormPendingContext.Provider>
    </form>
  );
}

export function ForgotForm() {
  const [state, onSubmit, pending] = useFormAction(requestPasswordResetAction);
  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <FormPendingContext.Provider value={pending}>
      <h1 className="text-xl font-semibold tracking-tight text-fg">Reset password</h1>
      <p className="text-sm text-muted">Enter your admin email. If the account exists, we will email a link that expires in 30 minutes.</p>
      <Message state={state} />
      <div>
        <label htmlFor="email" className={labelCls}>Email</label>
        <input id="email" name="email" type="email" autoComplete="username" required className={inputCls} />
      </div>
      <SubmitButton className="w-full">Send reset link</SubmitButton>
      <Link href="/admin/login" className="block text-center text-sm text-muted hover:text-fg">Back to sign in</Link>
      </FormPendingContext.Provider>
    </form>
  );
}

export function ResetForm({ token }: { token: string }) {
  const [state, onSubmit, pending] = useFormAction(resetPasswordAction);
  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <FormPendingContext.Provider value={pending}>
      <h1 className="text-xl font-semibold tracking-tight text-fg">Choose a new password</h1>
      <p className="text-sm text-muted">At least 12 characters with a mix of letters, numbers and symbols. All existing sessions will be signed out.</p>
      <Message state={state} />
      <input type="hidden" name="token" value={token} />
      <div>
        <label htmlFor="password" className={labelCls}>New password</label>
        <input id="password" name="password" type="password" autoComplete="new-password" required minLength={12} className={inputCls} />
      </div>
      <div>
        <label htmlFor="confirm" className={labelCls}>Confirm password</label>
        <input id="confirm" name="confirm" type="password" autoComplete="new-password" required minLength={12} className={inputCls} />
      </div>
      <SubmitButton className="w-full">Update password</SubmitButton>
      <Link href="/admin/login" className="block text-center text-sm text-muted hover:text-fg">Back to sign in</Link>
      </FormPendingContext.Provider>
    </form>
  );
}
