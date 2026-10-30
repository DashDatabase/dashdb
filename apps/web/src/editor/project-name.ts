export const PROJECT_NAME_MAX = 100;

/** Trims and bounds a user-entered project name, falling back to "Untitled project". */
export function normalizeProjectName(name: string): string {
  return name.trim().slice(0, PROJECT_NAME_MAX) || 'Untitled project';
}
