'use client';

import { ScrollArea, Tabs, TabsContent, TabsList, TabsTrigger } from '@dashdb/ui';
import { CodePanel } from '../code/code-panel';
import { MigrationPanel } from '../migration/migration-panel';
import { useEditor, type RightTab } from '../store';
import { BaselinesPanel } from './baselines-panel';
import { Inspector } from './inspector';

function isRightTab(value: string): value is RightTab {
  return value === 'inspector' || value === 'code' || value === 'migration';
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
      {/* The code editor scrolls itself and needs the panel's full height. */}
      <TabsContent value="code" className="min-h-0 flex-1">
        <CodePanel />
      </TabsContent>
      {tab !== 'code' && (
        // Radix lays the viewport's content out as a table, which grows to fit wide content
        // (long SQL lines); a block keeps it at the panel's width so code scrolls on its own.
        <ScrollArea className="min-h-0 flex-1 [&_[data-slot=scroll-area-viewport]>div]:!block">
          <TabsContent value="inspector">
            <Inspector />
          </TabsContent>
          <TabsContent value="migration">
            <MigrationPanel />
            <BaselinesPanel />
          </TabsContent>
        </ScrollArea>
      )}
    </Tabs>
  );
}
