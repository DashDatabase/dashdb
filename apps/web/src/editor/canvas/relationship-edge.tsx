'use client';

import { BaseEdge, EdgeLabelRenderer, getSmoothStepPath, type EdgeProps } from '@xyflow/react';
import { memo } from 'react';
import { useEditor } from '../store';
import { useCanvasUi } from './canvas-ui';
import { markerId } from './markers';
import type { RelationshipFlowEdge } from './model';

function RelationshipEdgeView({
  id,
  source,
  target,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
  selected,
}: EdgeProps<RelationshipFlowEdge>) {
  const hovered = useCanvasUi((s) => s.hoveredEdge === id);
  const touchesSelection = useEditor(
    (s) =>
      s.canvasSelection.includes(source) ||
      s.canvasSelection.includes(target) ||
      s.selection.tableId === source ||
      s.selection.tableId === target,
  );
  const highlighted = hovered || touchesSelection || Boolean(selected);
  const [path, labelX, labelY] = getSmoothStepPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    borderRadius: 8,
    offset: 24,
  });
  if (!data) return null;

  return (
    <>
      <BaseEdge
        id={id}
        path={path}
        interactionWidth={16}
        markerStart={`url(#${markerId(data.sourceEnd, highlighted)})`}
        markerEnd={`url(#${markerId(data.targetEnd, highlighted)})`}
        style={{
          stroke: highlighted ? 'var(--primary)' : 'var(--text-muted)',
          strokeWidth: highlighted ? 1.75 : 1.25,
        }}
      />
      {hovered && (
        <EdgeLabelRenderer>
          <div
            role="tooltip"
            data-testid="edge-label"
            className="pointer-events-none absolute rounded-md border bg-surface-raised px-2 py-1 font-mono text-xs shadow-sm"
            style={{
              transform: `translate(-50%, -50%) translate(${String(labelX)}px, ${String(labelY)}px)`,
            }}
          >
            <div className="font-medium">{data.name}</div>
            <div className="text-text-muted">{data.label}</div>
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}

export const RelationshipEdge = memo(RelationshipEdgeView);
