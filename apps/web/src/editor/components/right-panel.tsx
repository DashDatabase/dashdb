'use client';

import { ScrollArea, Tabs, TabsContent, TabsList, TabsTrigger } from '@dashdb/ui';
import { edition } from '@/edition/active';
import { editorApi } from '../edition-api';
import { isBuiltinRightTab, useEditor, type RightTab } from '../store';
import { BaselinesPanel } from './baselines-panel';
import { Inspector } from './inspector';
import { CodePanel, MigrationPanel } from './lazy';

const editionTabs = edition.editor.rightPanelTabs;

function isRightTab(value: string): value is RightTab {
  return isBuiltinRightTab(value) || editionTabs.some((t) => value === `edition:${t.id}`);
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
          {editionTabs.map((t) => (
            <TabsTrigger key={t.id} value={`edition:${t.id}`}>
              {t.label}
            </TabsTrigger>
          ))}
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
          {editionTabs.map(({ id, Panel }) => (
            <TabsContent key={id} value={`edition:${id}`}>
              <Panel editor={editorApi} />
            </TabsContent>
          ))}
        </ScrollArea>
      )}
    </Tabs>
  );
}
