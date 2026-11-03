// The action registry plus the active edition's commands, for the palette and the key handler.
import { edition } from '@/edition/active';
import {
  ACTIONS,
  editionActions,
  GROUP_ORDER,
  type ActionGroup,
  type EditorAction,
} from './actions';
import { editorApi } from './edition-api';

export const EDITION_ACTIONS: readonly EditorAction[] = editionActions(
  edition.editor.commands,
  editorApi,
);

export const ALL_ACTIONS: readonly EditorAction[] = [...ACTIONS, ...EDITION_ACTIONS];

/** GROUP_ORDER, plus `Edition` when the edition adds commands. */
export const PALETTE_GROUPS: readonly ActionGroup[] =
  EDITION_ACTIONS.length > 0 ? [...GROUP_ORDER, 'Edition'] : GROUP_ORDER;
