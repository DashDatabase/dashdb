import { describe, expect, it } from 'vitest';
import {
  ariaShortcut,
  formatShortcut,
  isEditableTarget,
  matchesShortcut,
  parseShortcut,
  type ShortcutEvent,
} from './shortcuts';

function key(init: Partial<ShortcutEvent> & { key: string }): ShortcutEvent {
  const code = /^[a-z]$/i.test(init.key)
    ? `Key${init.key.toUpperCase()}`
    : /^\d$/.test(init.key)
      ? `Digit${init.key}`
      : init.key;
  return { code, ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, ...init };
}

describe('parseShortcut', () => {
  it('splits modifiers from the key', () => {
    expect(parseShortcut('mod+shift+Z')).toEqual({ mod: true, alt: false, shift: true, key: 'z' });
    expect(parseShortcut('/')).toEqual({ mod: false, alt: false, shift: false, key: '/' });
  });

  it('rejects unknown modifiers and empty keys', () => {
    expect(() => parseShortcut('hyper+k')).toThrow();
    expect(() => parseShortcut('mod+')).toThrow();
  });
});

describe('matchesShortcut', () => {
  it('maps mod to Cmd on macOS and Ctrl elsewhere', () => {
    expect(matchesShortcut(key({ key: 'k', metaKey: true }), 'mod+k', true)).toBe(true);
    expect(matchesShortcut(key({ key: 'k', ctrlKey: true }), 'mod+k', true)).toBe(false);
    expect(matchesShortcut(key({ key: 'k', ctrlKey: true }), 'mod+k', false)).toBe(true);
    expect(matchesShortcut(key({ key: 'k', metaKey: true }), 'mod+k', false)).toBe(false);
  });

  it('requires exact modifiers', () => {
    const shiftZ = key({ key: 'Z', ctrlKey: true, shiftKey: true });
    expect(matchesShortcut(shiftZ, 'mod+shift+z', false)).toBe(true);
    expect(matchesShortcut(shiftZ, 'mod+z', false)).toBe(false);
    expect(matchesShortcut(key({ key: 'n' }), 'shift+n', false)).toBe(false);
  });

  it('uses the physical key so Alt combos match on macOS', () => {
    // Option+1 types "¡" on a Mac keyboard.
    expect(matchesShortcut({ ...key({ key: '1', altKey: true }), key: '¡' }, 'alt+1', true)).toBe(
      true,
    );
  });

  it('matches named keys', () => {
    expect(matchesShortcut(key({ key: 'Enter', ctrlKey: true }), 'mod+enter', false)).toBe(true);
    expect(matchesShortcut(key({ key: 'F2' }), 'f2', false)).toBe(true);
    expect(matchesShortcut(key({ key: '/' }), '/', false)).toBe(true);
  });
});

describe('formatShortcut', () => {
  it('uses platform symbols', () => {
    expect(formatShortcut('mod+shift+z', true)).toEqual(['⌘', '⇧', 'Z']);
    expect(formatShortcut('mod+alt+b', false)).toEqual(['Ctrl', 'Alt', 'B']);
    expect(formatShortcut('mod+enter', false)).toEqual(['Ctrl', '↵']);
  });
});

describe('ariaShortcut', () => {
  it('uses ARIA key names', () => {
    expect(ariaShortcut('mod+shift+z', false)).toBe('Control+Shift+Z');
    expect(ariaShortcut('mod+enter', true)).toBe('Meta+Enter');
    expect(ariaShortcut('alt+1', false)).toBe('Alt+1');
  });
});

describe('isEditableTarget', () => {
  it('is false outside the DOM', () => {
    expect(isEditableTarget(null)).toBe(false);
  });
});
