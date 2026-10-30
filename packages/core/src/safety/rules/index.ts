import type { Rule } from '../types';
import { addFkValidating } from './add-fk-validating';
import { addNotNullWithoutDefault } from './add-not-null-without-default';
import { alterTableCopyAlgorithm } from './alter-table-copy-algorithm';
import { alterTypeRewrite } from './alter-type-rewrite';
import { createIndexBlocking } from './create-index-blocking';
import { dropColumn } from './drop-column';
import { dropTable } from './drop-table';
import { enumValueRemoval } from './enum-value-removal';
import { largeTableOnlineChange } from './large-table-online-change';
import { renameBreaksApp } from './rename-breaks-app';
import { setNotNullScan } from './set-not-null-scan';
import { volatileDefaultRewrite } from './volatile-default-rewrite';

/** Every rule, in the order their findings are reported for one operation. */
export const rules: readonly Rule[] = [
  dropTable,
  dropColumn,
  addNotNullWithoutDefault,
  createIndexBlocking,
  addFkValidating,
  setNotNullScan,
  alterTypeRewrite,
  renameBreaksApp,
  enumValueRemoval,
  volatileDefaultRewrite,
  alterTableCopyAlgorithm,
  largeTableOnlineChange,
];
