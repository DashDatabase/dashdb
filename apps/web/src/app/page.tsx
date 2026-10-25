import { Button } from '@dashdb/ui';
import { getApiUrl } from '@/lib/config';

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center gap-6 px-6">
      <h1 className="text-4xl font-semibold tracking-tight text-brand-900">DashDB</h1>
      <p className="text-slate-600">
        Web app is running. API health:{' '}
        <a className="font-mono text-brand-700 underline" href={`${getApiUrl()}/health`}>
          {getApiUrl()}/health
        </a>
      </p>
      <div>
        <Button>Get started</Button>
      </div>
    </main>
  );
}
