'use client';

import dynamic from 'next/dynamic';

// The editor reads IndexedDB and window size, so it never renders on the server.
export const ProjectsHome = dynamic(
  () => import('@/projects/projects-home').then((m) => m.ProjectsHome),
  { ssr: false },
);

export const EditorShell = dynamic(
  () => import('@/editor/components/editor-shell').then((m) => m.EditorShell),
  { ssr: false },
);
