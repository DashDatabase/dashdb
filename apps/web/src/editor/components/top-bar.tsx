'use client';

import {
  Badge,
  Button,
  LogoMark,
  Separator,
  ThemeToggle,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@dashdb/ui';
import {
  GitCompareArrowsIcon,
  Redo2Icon,
  SearchIcon,
  Share2Icon,
  StarIcon,
  Undo2Icon,
  UploadIcon,
} from 'lucide-react';
import Link from 'next/link';
import { useEffect, useRef } from 'react';
import { isCloudEdition } from '@dashdb/edition';
import { edition } from '@/edition/active';
import { getGithubUrl } from '@/lib/config';
import { getAction } from '../actions';
import { editorApi } from '../edition-api';
import { useRunAction } from '../hooks';
import { useEditor } from '../store';
import { ActionButton, ShortcutKeys } from './action-button';
import { CommitInput } from './commit-input';
import { ExportMenu } from './export-menu';
import { GithubIcon } from './github-icon';

const DIALECT_LABELS = { postgres: 'PostgreSQL', mysql: 'MySQL', sqlite: 'SQLite' } as const;

/** Text controls on the 4px grid: 8px between icon and label, 12px side padding. */
const barButton = 'gap-2 has-[>svg]:px-3';

export function TopBar() {
  const name = useEditor((s) => s.doc?.name ?? '');
  const dialect = useEditor((s) => s.doc?.schema.dialect ?? 'postgres');
  const dialog = useEditor((s) => s.dialog);
  const rename = useEditor((s) => s.rename);
  const closeDialog = useEditor((s) => s.closeDialog);
  const nameRef = useRef<HTMLInputElement>(null);
  const run = useRunAction();

  // "Rename project" (F2) focuses the inline name field rather than opening a dialog.
  useEffect(() => {
    if (dialog !== 'rename') return;
    nameRef.current?.focus();
    nameRef.current?.select();
    closeDialog();
  }, [dialog, closeDialog]);

  return (
    <header className="flex h-12 shrink-0 items-center gap-2 border-b border-border bg-surface px-3">
      <Tooltip>
        <TooltipTrigger asChild>
          <Link
            href="/app"
            className="inline-flex size-8 shrink-0 items-center justify-center rounded-md outline-none hover:bg-highlight focus-visible:ring-[3px] focus-visible:ring-ring/50"
          >
            <LogoMark className="size-6" aria-label="All projects" />
          </Link>
        </TooltipTrigger>
        <TooltipContent>All projects</TooltipContent>
      </Tooltip>

      <CommitInput
        ref={nameRef}
        aria-label="Project name"
        value={name}
        onCommit={rename}
        maxLength={100}
        className="h-8 w-40 border-transparent bg-transparent px-2 font-medium shadow-none hover:border-border focus-visible:border-ring xl:w-56 dark:bg-transparent"
      />
      <Badge variant="outline" data-testid="dialect-badge" className="h-6 px-2 py-0">
        {DIALECT_LABELS[dialect]}
      </Badge>

      <Separator orientation="vertical" className="mx-1 h-4" />
      <ActionButton action="edit.undo" variant="ghost" size="icon-sm">
        <Undo2Icon aria-hidden className="size-4" />
      </ActionButton>
      <ActionButton action="edit.redo" variant="ghost" size="icon-sm">
        <Redo2Icon aria-hidden className="size-4" />
      </ActionButton>
      <Separator orientation="vertical" className="mx-1 h-4" />
      <ActionButton action="file.import" variant="ghost" size="sm" className={barButton}>
        <UploadIcon aria-hidden className="size-4" />{' '}
        <span className="hidden xl:inline">Import</span>
      </ActionButton>
      <ExportMenu />

      <div className="flex-1" />

      <Button
        variant="outline"
        size="sm"
        className={`hidden w-52 justify-between text-text-muted xl:flex ${barButton}`}
        onClick={() => {
          run(getAction('palette.open'));
        }}
      >
        <span className="flex items-center gap-2">
          <SearchIcon aria-hidden className="size-4" /> Search actions…
        </span>
        <ShortcutKeys shortcut="mod+k" />
      </Button>
      <ActionButton action="migration.generate" size="sm" className={barButton}>
        <GitCompareArrowsIcon aria-hidden className="size-4" /> Generate migration
      </ActionButton>
      <Separator orientation="vertical" className="mx-1 h-4" />
      <ThemeToggle className="size-8" />
      {edition.editor.topBarItems.map(({ id, Component }) => (
        <Component key={id} editor={editorApi} />
      ))}
      {isCloudEdition() && (
        <Tooltip>
          <TooltipTrigger asChild>
            {/* Disabled buttons swallow pointer events, so the tooltip hangs off a focusable wrapper. */}
            <span
              tabIndex={0}
              className="rounded-md outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
            >
              <Button
                variant="ghost"
                size="sm"
                disabled
                tabIndex={-1}
                aria-label="Share"
                className={barButton}
              >
                <Share2Icon aria-hidden className="size-4" />{' '}
                <span className="hidden xl:inline">Share</span>
              </Button>
            </span>
          </TooltipTrigger>
          <TooltipContent>Sharing arrives with DashDB Cloud</TooltipContent>
        </Tooltip>
      )}
      <Button variant="outline" size="sm" asChild className={barButton}>
        <a
          href={getGithubUrl()}
          target="_blank"
          rel="noreferrer"
          aria-label="Star DashDB on GitHub"
        >
          <GithubIcon className="size-4 scale-90" />
          <StarIcon aria-hidden className="size-4" /> <span className="hidden xl:inline">Star</span>
        </a>
      </Button>
    </header>
  );
}
