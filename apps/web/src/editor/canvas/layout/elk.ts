// ELK layered layout for the diagram. Runs inside the layout worker (and directly in tests).
import type { ELK, ElkNode, LayoutOptions } from 'elkjs/lib/elk-api';
import { snap } from '../model';

export interface LayoutNodeInput {
  readonly id: string;
  readonly width: number;
  readonly height: number;
}

export interface LayoutEdgeInput {
  readonly id: string;
  /** The referenced table: parents are placed before their children. */
  readonly source: string;
  readonly target: string;
}

export interface LayoutRequest {
  readonly nodes: readonly LayoutNodeInput[];
  readonly edges: readonly LayoutEdgeInput[];
}

export type LayoutPositions = Record<string, { x: number; y: number }>;

export const LAYOUT_OPTIONS: LayoutOptions = {
  'elk.algorithm': 'layered',
  'elk.direction': 'RIGHT',
  'elk.edgeRouting': 'ORTHOGONAL',
  'elk.layered.nodePlacement.strategy': 'BRANDES_KOEPF',
  'elk.layered.crossingMinimization.strategy': 'LAYER_SWEEP',
  'elk.layered.spacing.nodeNodeBetweenLayers': '96',
  'elk.layered.spacing.edgeNodeBetweenLayers': '32',
  'elk.spacing.nodeNode': '48',
  'elk.spacing.edgeNode': '24',
  'elk.separateConnectedComponents': 'true',
  'elk.spacing.componentComponent': '96',
  'elk.aspectRatio': '1.6',
};

export function toElkGraph({ nodes, edges }: LayoutRequest): ElkNode {
  const ids = new Set(nodes.map((n) => n.id));
  return {
    id: 'root',
    layoutOptions: LAYOUT_OPTIONS,
    children: nodes.map(({ id, width, height }) => ({ id, width, height })),
    edges: edges
      // Self-references and dangling edges add nothing to the layering.
      .filter((e) => e.source !== e.target && ids.has(e.source) && ids.has(e.target))
      .map((e) => ({ id: e.id, sources: [e.source], targets: [e.target] })),
  };
}

/** Top-left positions per node, snapped to the canvas grid. */
export async function computeLayout(elk: ELK, request: LayoutRequest): Promise<LayoutPositions> {
  const result = await elk.layout(toElkGraph(request));
  const positions: LayoutPositions = {};
  for (const child of result.children ?? []) {
    positions[child.id] = { x: snap(child.x ?? 0), y: snap(child.y ?? 0) };
  }
  return positions;
}
