'use client';

import { useActionState, useId } from 'react';
import { joinWaitlist, type WaitlistState } from '@/lib/waitlist/action';
import { HONEYPOT_FIELD } from '@/lib/waitlist/fields';

const IDLE: WaitlistState = { status: 'idle' };

/** Email signup for news and the planned cloud features. Submits without JavaScript, too. */
export function WaitlistForm({
  source,
  label = 'Get product updates',
  cta = 'Join the waitlist',
}: {
  /** The page path it sits on, stored with the signup. */
  source: string;
  label?: string;
  cta?: string;
}) {
  const [state, action, pending] = useActionState(joinWaitlist, IDLE);
  const id = useId();
  const emailId = `${id}-email`;
  const messageId = `${id}-message`;
  const trapId = `${id}-trap`;

  if (state.status === 'success') {
    return (
      <p
        role="status"
        className="text-sm font-medium text-success-text"
        data-testid="waitlist-done"
      >
        {state.message}
      </p>
    );
  }

  return (
    <form action={action} className="w-full max-w-md" data-testid="waitlist-form" noValidate>
      <label htmlFor={emailId} className="mb-1.5 block text-sm font-medium">
        {label}
      </label>
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          id={emailId}
          name="email"
          type="email"
          required
          maxLength={254}
          autoComplete="email"
          placeholder="you@company.com"
          aria-invalid={state.status === 'error'}
          aria-describedby={state.status === 'error' ? messageId : undefined}
          className="h-11 min-w-0 flex-1 rounded-md border border-input bg-background px-3 text-base outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
        <button
          type="submit"
          disabled={pending}
          className="h-11 rounded-md bg-primary px-5 text-sm font-medium text-primary-foreground hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none disabled:opacity-60"
        >
          {pending ? 'Joining…' : cta}
        </button>
      </div>
      <input type="hidden" name="source" value={source} />
      {/* Honeypot: hidden from people and assistive tech; bots that fill it are ignored. */}
      <div aria-hidden="true" className="absolute -left-[9999px] h-px w-px overflow-hidden">
        <label htmlFor={trapId}>Leave this field empty</label>
        <input id={trapId} name={HONEYPOT_FIELD} type="text" tabIndex={-1} autoComplete="off" />
      </div>
      <p
        id={messageId}
        role={state.status === 'error' ? 'alert' : undefined}
        className="mt-2 min-h-5 text-sm text-danger-text"
      >
        {state.status === 'error' ? state.message : ''}
      </p>
      <p className="text-xs text-text-muted">
        No spam. Unsubscribe anytime. See the{' '}
        <a href="/privacy" className="underline">
          privacy policy
        </a>
        .
      </p>
    </form>
  );
}
