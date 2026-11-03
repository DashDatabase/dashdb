'use server';

import { headers } from 'next/headers';
import { isCloudEdition } from '@dashdb/edition';
import { clientKey, createRateLimiter } from './rate-limit';
import { saveSignup, storesFromEnv, type SubscriberStore } from './store';
import { parseSignup } from './validate';

export type WaitlistState =
  { readonly status: 'idle' } | { readonly status: 'success' | 'error'; readonly message: string };

const SUCCESS: WaitlistState = {
  status: 'success',
  message: "You're on the list. We'll email you when there's news.",
};

// Per client: a few tries for typos. Global: a ceiling no spoofed header can get around.
const perClient = createRateLimiter({ limit: 5, windowMs: 10 * 60_000 });
const everyone = createRateLimiter({ limit: 60, windowMs: 60_000, maxKeys: 1 });

let stores: SubscriberStore[] | undefined;

/** The waitlist / newsletter form's action (works without JavaScript too). */
export async function joinWaitlist(
  _previous: WaitlistState,
  form: FormData,
): Promise<WaitlistState> {
  // Self-hosted builds render no form, but the action is still reachable by a direct POST.
  if (!isCloudEdition()) {
    return { status: 'error', message: 'The waitlist is not available on this server.' };
  }
  const input = parseSignup(form);
  // Bots get the same answer as people, so the honeypot isn't revealed.
  if (input.kind === 'bot') return SUCCESS;
  if (input.kind === 'invalid') return { status: 'error', message: input.message };

  const key = clientKey(await headers());
  if (!perClient.take(key) || !everyone.take('all')) {
    return { status: 'error', message: 'Too many attempts. Please try again in a few minutes.' };
  }

  stores ??= storesFromEnv({
    RESEND_API_KEY: process.env.RESEND_API_KEY,
    RESEND_AUDIENCE_ID: process.env.RESEND_AUDIENCE_ID,
  });
  const result = await saveSignup(stores, input.email, input.source);
  if (result === 'saved') return SUCCESS;
  if (result === 'unconfigured' && process.env.NODE_ENV !== 'production') {
    // Local development without Resend: accept, but say where it went.
    console.info(`[waitlist] no store configured; dropped a signup from ${input.source}`);
    return SUCCESS;
  }
  return {
    status: 'error',
    message: "We couldn't save your email just now. Please try again later.",
  };
}
