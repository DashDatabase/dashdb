'use client';

import type { IrDialect } from '@dashdb/core';
import {
  Badge,
  Button,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Input,
  Logo,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Skeleton,
  ThemeToggle,
  toast,
} from '@dashdb/ui';
import {
  ChevronDownIcon,
  CopyIcon,
  FileUpIcon,
  LayoutTemplateIcon,
  MoreHorizontalIcon,
  PencilIcon,
  PlusIcon,
  TableIcon,
  Trash2Icon,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useId, useRef, useState, type SubmitEvent } from 'react';
import {
  MAX_IMPORT_BYTES,
  PROJECT_IMPORT_ACCEPT,
  detectImportFormat,
  importSchema,
} from '@/editor/formats';
import {
  PROJECT_NAME_MAX,
  createProject,
  deleteProject,
  duplicateProject,
  listProjects,
  renameProject,
  type Project,
} from '@/editor/projects';
import {
  MAX_PROJECT_FILE_BYTES,
  importProjectFile,
  isProjectFileName,
} from '@/editor/project-file';
import { relativeTime } from '@/editor/schema-text';
import { TEMPLATES, schemaFromTemplate, type Template } from '@/editor/templates';

const DIALECTS: { value: Extract<IrDialect, 'postgres' | 'mysql'>; label: string }[] = [
  { value: 'postgres', label: 'PostgreSQL' },
  { value: 'mysql', label: 'MySQL' },
];
const DIALECT_LABELS = { postgres: 'PostgreSQL', mysql: 'MySQL', sqlite: 'SQLite' } as const;

function NewProjectDialog({
  open,
  onOpenChange,
  onCreate,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreate: (name: string, dialect: IrDialect) => Promise<void>;
}) {
  const nameId = useId();
  const dialectId = useId();
  const [dialect, setDialect] = useState<IrDialect>('postgres');
  const [busy, setBusy] = useState(false);

  const submit = async (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    const name = new FormData(event.currentTarget).get('name');
    setBusy(true);
    try {
      await onCreate(typeof name === 'string' ? name : '', dialect);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={(event) => void submit(event)} className="space-y-4">
          <DialogHeader>
            <DialogTitle>New project</DialogTitle>
            <DialogDescription>Projects are saved in this browser.</DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <label htmlFor={nameId} className="text-sm font-medium">
              Name
            </label>
            <Input
              id={nameId}
              name="name"
              placeholder="Untitled project"
              maxLength={PROJECT_NAME_MAX}
              autoFocus
            />
          </div>
          <div className="space-y-1.5">
            <label htmlFor={dialectId} className="text-sm font-medium">
              Database
            </label>
            <Select
              value={dialect}
              onValueChange={(value) => {
                if (value === 'postgres' || value === 'mysql') setDialect(value);
              }}
            >
              <SelectTrigger id={dialectId} className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DIALECTS.map((d) => (
                  <SelectItem key={d.value} value={d.value}>
                    {d.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                Cancel
              </Button>
            </DialogClose>
            <Button type="submit" disabled={busy}>
              Create project
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function RenameDialog({
  project,
  onOpenChange,
  onRename,
}: {
  project: Project | null;
  onOpenChange: (open: boolean) => void;
  onRename: (project: Project, name: string) => Promise<void>;
}) {
  const nameId = useId();
  return (
    <Dialog open={project !== null} onOpenChange={onOpenChange}>
      <DialogContent>
        {project && (
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              const name = new FormData(event.currentTarget).get('name');
              void onRename(project, typeof name === 'string' ? name : '');
            }}
          >
            <DialogHeader>
              <DialogTitle>Rename project</DialogTitle>
              <DialogDescription>Give “{project.name}” a new name.</DialogDescription>
            </DialogHeader>
            <div className="space-y-1.5">
              <label htmlFor={nameId} className="text-sm font-medium">
                Name
              </label>
              <Input
                id={nameId}
                name="name"
                defaultValue={project.name}
                maxLength={PROJECT_NAME_MAX}
                autoFocus
              />
            </div>
            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="outline">
                  Cancel
                </Button>
              </DialogClose>
              <Button type="submit">Rename</Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

function DeleteDialog({
  project,
  onOpenChange,
  onDelete,
}: {
  project: Project | null;
  onOpenChange: (open: boolean) => void;
  onDelete: (project: Project) => Promise<void>;
}) {
  return (
    <Dialog open={project !== null} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete “{project?.name}”?</DialogTitle>
          <DialogDescription>
            This removes the project from this browser. It cannot be undone.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Cancel</Button>
          </DialogClose>
          <Button
            variant="destructive"
            onClick={() => {
              if (project) void onDelete(project);
            }}
          >
            Delete project
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ImportErrorsDialog({
  result,
  onOpenChange,
}: {
  result: { fileName: string; errors: string[] } | null;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={result !== null} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Could not import {result?.fileName}</DialogTitle>
          <DialogDescription>
            Nothing was changed. Fix these problems in the file and try again.
          </DialogDescription>
        </DialogHeader>
        <ul
          data-testid="import-errors"
          className="max-h-72 space-y-1 overflow-y-auto rounded-md border bg-surface p-3 font-mono text-xs text-danger-text"
        >
          {result?.errors.map((error, i) => (
            <li key={`${String(i)}:${error}`}>{error}</li>
          ))}
        </ul>
        <DialogFooter>
          <DialogClose asChild>
            <Button>Done</Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ProjectCard({
  project,
  onRename,
  onDuplicate,
  onDelete,
}: {
  project: Project;
  onRename: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  const { schema } = project;
  return (
    <li className="group relative rounded-lg border bg-surface-raised shadow-xs transition-shadow hover:shadow-md">
      <Link
        href={`/app/p/${project.id}`}
        className="block space-y-3 rounded-lg p-4 outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
      >
        <div className="flex items-start gap-2 pr-8">
          <h2 className="truncate font-medium">{project.name}</h2>
        </div>
        <div className="flex items-center gap-2 text-sm text-text-muted">
          <Badge variant="outline">{DIALECT_LABELS[schema.dialect]}</Badge>
          <span className="flex items-center gap-1">
            <TableIcon className="size-3.5" aria-hidden />
            {schema.tables.length} {schema.tables.length === 1 ? 'table' : 'tables'}
          </span>
        </div>
        <p className="text-xs text-text-muted">Edited {relativeTime(project.updatedAt)}</p>
      </Link>
      <div className="absolute top-3 right-3">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${project.name}`}>
              <MoreHorizontalIcon aria-hidden />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={onRename}>
              <PencilIcon aria-hidden /> Rename
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={onDuplicate}>
              <CopyIcon aria-hidden /> Duplicate
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onSelect={onDelete}>
              <Trash2Icon aria-hidden /> Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </li>
  );
}

export function ProjectsHome() {
  const router = useRouter();
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [creating, setCreating] = useState(false);
  const [renaming, setRenaming] = useState<Project | null>(null);
  const [deleting, setDeleting] = useState<Project | null>(null);
  const [importErrors, setImportErrors] = useState<{ fileName: string; errors: string[] } | null>(
    null,
  );
  const fileRef = useRef<HTMLInputElement>(null);

  const refresh = useCallback(
    () =>
      listProjects().then(setProjects, () => {
        setProjects([]);
        toast.error('Could not read projects from this browser.');
      }),
    [],
  );

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const open = (project: Project) => {
    router.push(`/app/p/${project.id}`);
  };

  const create = async (name: string, dialect: IrDialect) => {
    open(await createProject({ name, dialect }));
  };

  const fromTemplate = async (template: Template) => {
    open(await createProject({ name: template.name, schema: schemaFromTemplate(template) }));
  };

  const importFile = async (file: File) => {
    if (isProjectFileName(file.name) || file.name.toLowerCase().endsWith('.json')) {
      // Check the size before reading so a huge file is never loaded into memory.
      if (file.size > MAX_PROJECT_FILE_BYTES) {
        setImportErrors({ fileName: file.name, errors: ['The file is larger than 10 MB.'] });
        return;
      }
      const result = await importProjectFile(await file.text());
      if (result.ok) open(result.project);
      else setImportErrors({ fileName: file.name, errors: result.errors });
      return;
    }
    if (file.size > MAX_IMPORT_BYTES) {
      toast.error('That file is larger than 2 MB.');
      return;
    }
    const text = await file.text();
    const { schema, diagnostics } = importSchema(detectImportFormat(file.name, text), text);
    if (schema.tables.length === 0 && diagnostics.some((d) => d.severity === 'error')) {
      toast.error(`Could not import ${file.name}`, { description: diagnostics[0]?.message });
      return;
    }
    open(await createProject({ name: file.name.replace(/\.[^.]+$/, ''), schema }));
  };

  return (
    <div className="min-h-dvh bg-background">
      <header className="border-b bg-surface">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 sm:px-6">
          <Link href="/" aria-label="DashDB home">
            <Logo className="h-7" />
          </Link>
          <ThemeToggle />
        </div>
      </header>
      <main className="mx-auto max-w-6xl space-y-6 px-4 py-8 sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Projects</h1>
            <p className="text-sm text-text-muted">Schemas saved in this browser.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              onClick={() => {
                fileRef.current?.click();
              }}
            >
              <FileUpIcon aria-hidden /> Import file
            </Button>
            <input
              ref={fileRef}
              type="file"
              accept={PROJECT_IMPORT_ACCEPT}
              className="hidden"
              aria-label="Import schema file"
              data-testid="import-file-input"
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = '';
                if (file) void importFile(file);
              }}
            />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline">
                  <LayoutTemplateIcon aria-hidden /> From template <ChevronDownIcon aria-hidden />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-64">
                <DropdownMenuLabel>Start from a template</DropdownMenuLabel>
                {TEMPLATES.map((template) => (
                  <DropdownMenuItem
                    key={template.id}
                    onSelect={() => void fromTemplate(template)}
                    className="flex-col items-start gap-0.5"
                  >
                    <span className="font-medium">{template.name}</span>
                    <span className="text-xs text-text-muted">{template.description}</span>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            <Button
              onClick={() => {
                setCreating(true);
              }}
            >
              <PlusIcon aria-hidden /> New project
            </Button>
          </div>
        </div>

        {projects === null ? (
          <ul
            aria-busy="true"
            aria-label="Loading projects"
            className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
          >
            {[0, 1, 2].map((i) => (
              <li key={i}>
                <Skeleton className="h-32" />
              </li>
            ))}
          </ul>
        ) : projects.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed px-6 py-16 text-center">
            <p className="font-medium">No projects yet</p>
            <p className="max-w-sm text-sm text-text-muted">
              Create an empty project, start from a template, or import a SQL, Prisma or DBML file.
            </p>
            <Button
              onClick={() => {
                setCreating(true);
              }}
            >
              <PlusIcon aria-hidden /> New project
            </Button>
          </div>
        ) : (
          <ul aria-label="Projects" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {projects.map((project) => (
              <ProjectCard
                key={project.id}
                project={project}
                onRename={() => {
                  setRenaming(project);
                }}
                onDuplicate={() => {
                  void duplicateProject(project.id).then(async (copy) => {
                    if (copy) toast.success(`Created “${copy.name}”`);
                    await refresh();
                  });
                }}
                onDelete={() => {
                  setDeleting(project);
                }}
              />
            ))}
          </ul>
        )}
      </main>

      <NewProjectDialog open={creating} onOpenChange={setCreating} onCreate={create} />
      <RenameDialog
        project={renaming}
        onOpenChange={(next) => {
          if (!next) setRenaming(null);
        }}
        onRename={async (project, name) => {
          await renameProject(project.id, name);
          setRenaming(null);
          await refresh();
        }}
      />
      <ImportErrorsDialog
        result={importErrors}
        onOpenChange={(next) => {
          if (!next) setImportErrors(null);
        }}
      />
      <DeleteDialog
        project={deleting}
        onOpenChange={(next) => {
          if (!next) setDeleting(null);
        }}
        onDelete={async (project) => {
          await deleteProject(project.id);
          setDeleting(null);
          toast.success(`Deleted “${project.name}”`);
          await refresh();
        }}
      />
    </div>
  );
}
