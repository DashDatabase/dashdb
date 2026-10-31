// Keyboard shortcut strings such as "mod+shift+z": parsing, matching and display.
// `mod` is Cmd on macOS and Ctrl elsewhere.

export interface ParsedShortcut {
  readonly mod: boolean;
  readonly alt: boolean;
  readonly shift: boolean;
  /** Lowercase key: a letter, digit, or a name such as `enter`, `backspace`, `f2`, `/`. */
  readonly key: string;
}

const MODIFIERS = new Set(['mod', 'alt', 'shift']);

export function parseShortcut(shortcut: string): ParsedShortcut {
  const parts = shortcut.toLowerCase().split('+');
  const key = parts.at(-1);
  const modifiers = parts.slice(0, -1);
  if (!key || modifiers.some((m) => !MODIFIERS.has(m))) {
    throw new Error(`Invalid shortcut "${shortcut}"`);
  }
  return {
    mod: modifiers.includes('mod'),
    alt: modifiers.includes('alt'),
    shift: modifiers.includes('shift'),
    key,
  };
}

export interface ShortcutEvent {
  readonly key: string;
  readonly code: string;
  readonly ctrlKey: boolean;
  readonly metaKey: boolean;
  readonly altKey: boolean;
  readonly shiftKey: boolean;
}

/** The pressed key, using the physical key for letters and digits so Alt/Shift can't remap it. */
function eventKey(event: ShortcutEvent): string {
  const letter = /^Key([A-Z])$/.exec(event.code);
  if (letter?.[1]) return letter[1].toLowerCase();
  const digit = /^Digit(\d)$/.exec(event.code);
  if (digit?.[1]) return digit[1];
  // Shift+/ reports "?" as its key; the shortcut names the physical key.
  if (event.code === 'Slash') return '/';
  return event.key.toLowerCase();
}

export function matchesShortcut(event: ShortcutEvent, shortcut: string, isMac: boolean): boolean {
  const parsed = parseShortcut(shortcut);
  const mod = isMac ? event.metaKey : event.ctrlKey;
  // The other platform's "mod" key must not be held (e.g. Ctrl+K on a Mac is not Cmd+K).
  const otherMod = isMac ? event.ctrlKey : event.metaKey;
  return (
    parsed.mod === mod &&
    !otherMod &&
    parsed.alt === event.altKey &&
    parsed.shift === event.shiftKey &&
    parsed.key === eventKey(event)
  );
}

const KEY_LABELS: Record<string, string> = {
  enter: '↵',
  backspace: '⌫',
  delete: 'Del',
  escape: 'Esc',
  arrowup: '↑',
  arrowdown: '↓',
};

/** Display labels for each key in a shortcut, e.g. ["⌘", "⇧", "Z"] or ["Ctrl", "Shift", "Z"]. */
export function formatShortcut(shortcut: string, isMac: boolean): string[] {
  const { mod, alt, shift, key } = parseShortcut(shortcut);
  if (shift && key === '/' && !mod && !alt) return ['?'];
  const keys: string[] = [];
  if (mod) keys.push(isMac ? '⌘' : 'Ctrl');
  if (alt) keys.push(isMac ? '⌥' : 'Alt');
  if (shift) keys.push(isMac ? '⇧' : 'Shift');
  keys.push(KEY_LABELS[key] ?? key.toUpperCase());
  return keys;
}

export function isMacPlatform(): boolean {
  return typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.userAgent);
}

/** True when focus is in a text field, where plain-key shortcuts must not fire. */
export function isEditableTarget(target: EventTarget | null): boolean {
  if (typeof HTMLElement === 'undefined' || !(target instanceof HTMLElement)) return false;
  return (
    target.isContentEditable ||
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement ||
    // Code editors take keystrokes on a plain element: Monaco uses the EditContext API in
    // Chromium (a <div>, neither contenteditable nor a textarea).
    ('editContext' in target && target.editContext != null) ||
    target.closest('.monaco-editor, [role="textbox"]') !== null
  );
}

const ARIA_KEYS: Record<string, string> = {
  enter: 'Enter',
  backspace: 'Backspace',
  delete: 'Delete',
  escape: 'Escape',
};

/** The `aria-keyshortcuts` form, e.g. "Meta+Shift+Z" on macOS, "Control+Shift+Z" elsewhere. */
export function ariaShortcut(shortcut: string, isMac: boolean): string {
  const { mod, alt, shift, key } = parseShortcut(shortcut);
  if (shift && key === '/' && !mod && !alt) return 'Shift+?';
  const keys: string[] = [];
  if (mod) keys.push(isMac ? 'Meta' : 'Control');
  if (alt) keys.push('Alt');
  if (shift) keys.push('Shift');
  keys.push(ARIA_KEYS[key] ?? key.toUpperCase());
  return keys.join('+');
}
