'use client';

import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@dashdb/ui';
import { useEditor } from '../store';

/** Confirms deleting tables, listing the relationships that go with them. */
export function DeleteTablesDialog() {
  const open = useEditor((s) => s.dialog === 'deleteTables');
  const pending = useEditor((s) => s.pendingDelete);
  const schema = useEditor((s) => s.doc?.schema);
  const closeDialog = useEditor((s) => s.closeDialog);
  const removeTables = useEditor((s) => s.removeTables);

  const ids = new Set(pending);
  const tables = (schema?.tables ?? []).filter((t) => ids.has(t.id));
  const relationships = (schema?.tables ?? []).reduce(
    (count, t) =>
      count + t.foreignKeys.filter((fk) => ids.has(t.id) || ids.has(fk.refTable)).length,
    0,
  );
  const title =
    tables.length === 1
      ? `Delete ${tables[0]?.name ?? 'table'}?`
      : `Delete ${String(tables.length)} tables?`;

  return (
    <Dialog
      open={open && tables.length > 0}
      onOpenChange={(next) => {
        if (!next) closeDialog();
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {relationships > 0
              ? `This also removes ${String(relationships)} ${relationships === 1 ? 'relationship' : 'relationships'}. `
              : ''}
            You can undo this.
          </DialogDescription>
        </DialogHeader>
        {tables.length > 1 && (
          <ul className="max-h-40 overflow-auto rounded-md border p-2 font-mono text-xs">
            {tables.map((t) => (
              <li key={t.id}>{t.name}</li>
            ))}
          </ul>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={closeDialog}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={() => {
              removeTables(pending);
              closeDialog();
            }}
          >
            {tables.length === 1 ? 'Delete table' : 'Delete tables'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
