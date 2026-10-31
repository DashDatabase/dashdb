import { z } from 'zod';
import { PAGES } from '../site';
import { HONEYPOT_FIELD } from './fields';

// RFC 5321 caps a path at 254 characters; anything longer is not a deliverable address.
const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(254, 'That email address is too long.')
  .pipe(z.email('Enter a valid email address.'));

const KNOWN_SOURCES = new Set<string>(PAGES.map((p) => p.path));

export type SignupInput =
  | { readonly kind: 'ok'; readonly email: string; readonly source: string }
  | { readonly kind: 'invalid'; readonly message: string }
  | { readonly kind: 'bot' };

/** Reads the waitlist form. Only strings are accepted; files and missing fields are invalid. */
export function parseSignup(form: FormData): SignupInput {
  const trap = form.get(HONEYPOT_FIELD);
  if (typeof trap === 'string' && trap.trim() !== '') return { kind: 'bot' };

  const raw = form.get('email');
  if (typeof raw !== 'string' || raw.length > 1000) {
    return { kind: 'invalid', message: 'Enter a valid email address.' };
  }
  const email = emailSchema.safeParse(raw);
  if (!email.success) {
    return {
      kind: 'invalid',
      message: email.error.issues[0]?.message ?? 'Enter a valid email address.',
    };
  }
  const source = form.get('source');
  return {
    kind: 'ok',
    email: email.data,
    // Only our own page paths are stored, never free text from the request.
    source: typeof source === 'string' && KNOWN_SOURCES.has(source) ? source : 'unknown',
  };
}
