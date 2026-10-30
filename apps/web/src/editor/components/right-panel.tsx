'use client';

import { ScrollArea, Tabs, TabsContent, TabsList, TabsTrigger } from '@dashdb/ui';
import { CodeIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { useEditor, type RightTab } from '../store';
import { BaselinesPanel } from './baselines-panel';
import { Inspector } from './inspector';

function isRightTab(value: string): value is RightTab {
  return value === 'inspector' || value === 'code' || value === 'migration';
}

function ComingSoon({ icon, title, body }: { icon: ReactNode; title: string; body: string }) {
  return (
    <div className="flex flex-col items-center gap-2 px-6 py-12 text-center">
      {icon}
      <p className="font-medium">{title}</p>
      <p className="text-sm text-text-muted">{body}</p>
    </div>
  );
}

export function RightPanel() {
  const tab = useEditor((s) => s.rightTab);
  const setRightTab = useEditor((s) => s.setRightTab);

  return (
    <Tabs
      value={tab}
      onValueChange={(value) => {
        if (isRightTab(value)) setRightTab(value);
      }}
      className="flex h-full flex-col gap-0 bg-surface"
    >
      <div className="border-b p-2">
        <TabsList className="w-full">
          <TabsTrigger value="inspector">Inspector</TabsTrigger>
          <TabsTrigger value="code">Code</TabsTrigger>
          <TabsTrigger value="migration">Migration</TabsTrigger>
        </TabsList>
      </div>
      <ScrollArea className="min-h-0 flex-1">
        <TabsContent value="inspector">
          <Inspector />
        </TabsContent>
        <TabsContent value="code">
          <ComingSoon
            icon={<CodeIcon className="size-6 text-text-muted" aria-hidden />}
            title="Live code"
            body="SQL, Prisma, Drizzle and DBML for this schema, updated as you edit."
          />
        </TabsContent>
        <TabsContent value="migration">
          <BaselinesPanel />
        </TabsContent>
      </ScrollArea>
    </Tabs>
  );
}
