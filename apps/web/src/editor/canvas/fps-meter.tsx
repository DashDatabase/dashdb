'use client';

import { Button } from '@dashdb/ui';
import { GaugeIcon } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { editorStore, useEditor } from '../store';
import { STRESS_TABLE_COUNT, stressSchema } from './stress-fixture';

/** The 60fps target size and the stress size. */
const STRESS_SIZES = [300, STRESS_TABLE_COUNT] as const;

/** Frames per second over a sliding one-second window, sampled with requestAnimationFrame. */
function useFps(): number {
  const [fps, setFps] = useState(0);
  const frames = useRef<number[]>([]);
  useEffect(() => {
    let raf = 0;
    let lastReport = 0;
    const tick = (now: number) => {
      const list = frames.current;
      list.push(now);
      while (list.length > 0 && (list[0] ?? now) < now - 1000) list.shift();
      if (now - lastReport > 250) {
        lastReport = now;
        setFps(list.length);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
    };
  }, []);
  return fps;
}

/** Development-only overlay: live FPS plus buttons that load the stress fixture. */
export function FpsMeter() {
  const fps = useFps();
  const tables = useEditor((s) => s.doc?.schema.tables.length ?? 0);
  const dialect = useEditor((s) => s.doc?.schema.dialect);
  const tone =
    fps >= 55 ? 'text-success-text' : fps >= 30 ? 'text-warning-text' : 'text-danger-text';

  return (
    <div
      data-testid="fps-meter"
      className="pointer-events-auto flex items-center gap-2 rounded-md border bg-surface-raised/90 px-2 py-1 font-mono text-xs shadow-sm"
    >
      <GaugeIcon className="size-3.5 text-text-muted" aria-hidden />
      <span className={tone} data-fps={fps}>
        {fps} fps
      </span>
      <span className="text-text-muted">· {tables} tables</span>
      {STRESS_SIZES.map((count) => (
        <Button
          key={count}
          variant="ghost"
          size="xs"
          disabled={dialect !== 'postgres'}
          onClick={() => {
            const state = editorStore.getState();
            state.editSchema('Load stress fixture', () => stressSchema(count));
            state.runCanvasCommand('arrange');
          }}
        >
          Load {count}
        </Button>
      ))}
    </div>
  );
}
