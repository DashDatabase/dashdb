// Projects created by importing or from a template open with an automatic arrange. The intent is
// handed from the projects page to the editor through sessionStorage (same tab only).
const KEY = 'dashdb:arrange-on-open';

export function markForArrange(projectId: string): void {
  try {
    sessionStorage.setItem(KEY, projectId);
  } catch {
    // Storage unavailable (private mode): the project just opens with the grid layout.
  }
}

/** True once for the marked project; clears the mark. */
export function takeArrangeIntent(projectId: string): boolean {
  try {
    if (sessionStorage.getItem(KEY) !== projectId) return false;
    sessionStorage.removeItem(KEY);
    return true;
  } catch {
    return false;
  }
}
