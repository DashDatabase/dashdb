'use client';

import { useParams } from 'next/navigation';
import { ErrorFallback } from '@/editor/components/error-fallback';

// Errors outside the editor's own boundary (route level) still offer the project export.
export default function EditorRouteError({ error, retry }: { error: unknown; retry: () => void }) {
  const params = useParams<{ projectId: string }>();
  return <ErrorFallback error={error} projectId={params.projectId} onRetry={retry} />;
}
