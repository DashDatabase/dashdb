import { nanoid } from 'nanoid';
import type { Id } from './types';

/** Generate a stable IR element id. */
export function createId(): Id {
  return nanoid();
}
