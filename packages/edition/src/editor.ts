import type { ComponentType } from 'react';

/** One change to a project document, in the same shape as immer's `Patch`. */
export interface DocumentPatch {
  readonly op: 'replace' | 'remove' | 'add';
  readonly path: (string | number)[];
  readonly value?: unknown;
}

/** What the editor exposes to edition code. Generic: nothing here knows about a server. */
export interface EditorApi {
  /** The open project's id, or null outside a project. */
  projectId(): string | null;
  /** Applies a change made elsewhere without adding an undo step. False if it doesn't apply. */
  applyRemoteChange(patches: readonly DocumentPatch[]): boolean;
  /** Every project stored in this browser, for an "upload to cloud" flow. */
  listLocalProjects(): Promise<readonly { readonly id: string; readonly name: string }[]>;
  /** The project as a `.dashdb.json` file with its baselines, or null if it doesn't exist. */
  exportProject(projectId: string): Promise<string | null>;
}

export interface SlotProps {
  readonly editor: EditorApi;
}

export interface TopBarItem {
  readonly id: string;
  readonly Component: ComponentType<SlotProps>;
}

export interface StatusBarItem {
  readonly id: string;
  readonly Component: ComponentType<SlotProps>;
}

export interface RightPanelTab {
  readonly id: string;
  readonly label: string;
  readonly Panel: ComponentType<SlotProps>;
}

/** A command in the command palette. */
export interface EditionCommand {
  readonly id: string;
  readonly label: string;
  /** Shown in the palette, for example `Mod+Shift+U`. */
  readonly shortcut?: string;
  run(editor: EditorApi): void;
}

/** The canvas viewport: pan in screen pixels and zoom factor. */
export interface CanvasViewport {
  readonly x: number;
  readonly y: number;
  readonly zoom: number;
}

export interface CanvasOverlayProps extends SlotProps {
  readonly viewport: CanvasViewport;
}

/** Drawn over the canvas (other people's cursors, for example). Ignores the pointer by default. */
export interface CanvasOverlay {
  readonly id: string;
  readonly Component: ComponentType<CanvasOverlayProps>;
}

/** An item in a project's menu on the projects page. */
export interface ProjectMenuItem {
  readonly id: string;
  readonly label: string;
  onSelect(projectId: string, editor: EditorApi): void;
}

export interface EditionEditor {
  readonly topBarItems: readonly TopBarItem[];
  readonly rightPanelTabs: readonly RightPanelTab[];
  readonly statusBarItems: readonly StatusBarItem[];
  readonly commands: readonly EditionCommand[];
  readonly canvasOverlays: readonly CanvasOverlay[];
  readonly projectMenuItems: readonly ProjectMenuItem[];
}

/** No slots filled: the Community editor. */
export const EMPTY_EDITOR: EditionEditor = {
  topBarItems: [],
  rightPanelTabs: [],
  statusBarItems: [],
  commands: [],
  canvasOverlays: [],
  projectMenuItems: [],
};
