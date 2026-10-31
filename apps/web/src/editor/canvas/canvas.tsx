'use client';

import type { Id } from '@dashdb/core/lite';
import { Button, toast, useTheme } from '@dashdb/ui';
import {
  applyNodeChanges,
  Background,
  BackgroundVariant,
  ConnectionMode,
  ConnectionLineType,
  Controls,
  MiniMap,
  Panel,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  useStore,
  type Connection,
  type EdgeMouseHandler,
  type NodeChange,
  type OnNodeDrag,
  type Viewport,
} from '@xyflow/react';
import { LayoutGridIcon, Loader2Icon, MaximizeIcon, PlusIcon } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState, type KeyboardEvent } from 'react';
import { getAction } from '../actions';
import { ActionButton, ShortcutKeys } from '../components/action-button';
import { useRunAction } from '../hooks';
import { ariaShortcut, isEditableTarget, isMacPlatform } from '../shortcuts';
import { editorStore, useEditor, type CanvasCommand } from '../store';
import { takeArrangeIntent } from './arrange-intent';
import { useCanvasUi } from './canvas-ui';
import { ConnectPopover } from './connect-popover';
import { DeleteTablesDialog } from './delete-dialog';
import { MigrationGhosts } from './migration-ghosts';
import { animatePositions, ARRANGE_DURATION_MS, layoutInWorker } from './layout/auto-layout';
import { RelationshipMarkers } from './markers';
import { CanvasContextMenu } from './menus';
import {
  buildEdges,
  COMPACT_ZOOM,
  estimateNodeHeight,
  GRID_SIZE,
  NODE_WIDTH,
  parseHandleId,
  snap,
  syncNodes,
  type RelationshipFlowEdge,
  type TableFlowNode,
} from './model';
import { selectedTableIds } from './operations';
import { proposeRelationship } from './relationship';
import { RelationshipEdge } from './relationship-edge';
import { TableNode } from './table-node';

const nodeTypes = { table: TableNode };
const edgeTypes = { relationship: RelationshipEdge };
const SNAP_GRID: [number, number] = [GRID_SIZE, GRID_SIZE];
const FIT_OPTIONS = { padding: 0.15, maxZoom: 1 };
/** Hides the "React Flow" corner link (allowed by its MIT licence). */
const PRO_OPTIONS = { hideAttribution: true };
/** Test hooks on `window`: development, or production builds made for profiling. */
const TEST_HOOKS =
  process.env.NODE_ENV === 'development' || process.env.NEXT_PUBLIC_CANVAS_PERF === '1';

function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function EmptyState() {
  const run = useRunAction();
  return (
    <Panel position="top-center" className="!top-1/2 !m-0 -translate-y-1/2">
      <div className="flex flex-col items-center gap-4 text-center">
        <div className="space-y-1">
          <p className="font-medium">Diagram canvas</p>
          <p className="text-sm text-text-muted">Add a table or import a schema to get started.</p>
        </div>
        <div className="flex gap-2">
          <Button
            onClick={() => {
              run(getAction('schema.addTable'));
            }}
          >
            <PlusIcon aria-hidden /> Add table <ShortcutKeys shortcut="n" />
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              run(getAction('file.import'));
            }}
          >
            Import schema
          </Button>
        </div>
      </div>
    </Panel>
  );
}

/** Keeps the store's canvas selection and primary selection in step with React Flow. */
function applySelection(changes: readonly NodeChange<TableFlowNode>[]) {
  const state = editorStore.getState();
  const selected = new Set(state.canvasSelection);
  let changed = false;
  for (const change of changes) {
    if (change.type !== 'select') continue;
    changed = true;
    if (change.selected) selected.add(change.id);
    else selected.delete(change.id);
  }
  if (!changed) return;
  const ids = [...selected];
  state.setCanvasSelection(ids);
  const primary = state.selection.tableId;
  if (ids.length === 0) {
    if (primary !== null) state.select(null);
  } else if (!primary || !selected.has(primary)) {
    state.select(ids.at(-1) ?? null);
  }
}

function CanvasFlow({ projectId }: { projectId: string }) {
  const schema = useEditor((s) => s.doc?.schema);
  const layout = useEditor((s) => s.doc?.layout);
  const canvasSelection = useEditor((s) => s.canvasSelection);
  const { resolvedTheme } = useTheme();
  const flow = useReactFlow<TableFlowNode, RelationshipFlowEdge>();
  const setHoveredEdge = useCanvasUi((s) => s.setHoveredEdge);
  const openMenu = useCanvasUi((s) => s.openMenu);
  const setConnection = useCanvasUi((s) => s.setConnection);
  const [arranging, setArranging] = useState(false);

  const selected = useMemo(() => new Set(canvasSelection), [canvasSelection]);
  const [nodes, setNodes] = useState<TableFlowNode[]>(() =>
    schema && layout ? syncNodes([], schema, layout, selected) : [],
  );
  // Re-sync during render when the document changes (React's "adjust state on prop change").
  const [synced, setSynced] = useState({ schema, layout, selected });
  if (synced.schema !== schema || synced.layout !== layout || synced.selected !== selected) {
    setSynced({ schema, layout, selected });
    if (schema && layout) setNodes((prev) => syncNodes(prev, schema, layout, selected));
  }
  const compact = useStore((s) => s.transform[2] < COMPACT_ZOOM);
  const edges = useMemo(
    () => (schema && layout ? buildEdges(schema, layout, compact) : []),
    [schema, layout, compact],
  );

  const onNodesChange = useCallback((changes: NodeChange<TableFlowNode>[]) => {
    setNodes((current) => applyNodeChanges(changes, current));
    applySelection(changes);
  }, []);

  const onNodeDragStop: OnNodeDrag<TableFlowNode> = useCallback((_event, _node, dragged) => {
    const positions: Record<Id, { x: number; y: number }> = {};
    for (const n of dragged) positions[n.id] = { x: snap(n.position.x), y: snap(n.position.y) };
    editorStore
      .getState()
      .setNodePositions(positions, dragged.length > 1 ? 'Move tables' : 'Move table');
  }, []);

  const isValidConnection = useCallback((connection: Connection | RelationshipFlowEdge) => {
    const from = parseHandleId(connection.sourceHandle);
    const to = parseHandleId(connection.targetHandle);
    if (!from?.columnId || !to?.columnId) return false;
    return !(connection.source === connection.target && from.columnId === to.columnId);
  }, []);

  const onConnect = useCallback(
    (connection: Connection) => {
      const doc = editorStore.getState().doc;
      const from = parseHandleId(connection.sourceHandle);
      const to = parseHandleId(connection.targetHandle);
      if (!doc || !from?.columnId || !to?.columnId) return;
      const draft = proposeRelationship(
        doc.schema,
        { tableId: connection.source, columnId: from.columnId },
        { tableId: connection.target, columnId: to.columnId },
      );
      if (!draft) return;
      const handle = document.querySelector(
        `.react-flow__handle[data-nodeid="${CSS.escape(connection.target)}"][data-handleid="${CSS.escape(connection.targetHandle ?? '')}"]`,
      );
      const rect = handle?.getBoundingClientRect();
      setConnection({
        draft,
        x: rect ? rect.right + 8 : window.innerWidth / 2,
        y: rect?.top ?? window.innerHeight / 2,
      });
    },
    [setConnection],
  );

  const onEdgeMouseEnter: EdgeMouseHandler<RelationshipFlowEdge> = useCallback(
    (_event, edge) => {
      setHoveredEdge(edge.id);
    },
    [setHoveredEdge],
  );
  const onEdgeMouseLeave: EdgeMouseHandler<RelationshipFlowEdge> = useCallback(() => {
    setHoveredEdge(null);
  }, [setHoveredEdge]);

  const updateCenter = useCallback((_event: unknown, viewport: Viewport) => {
    const pane = document.querySelector('[data-testid="canvas"]')?.getBoundingClientRect();
    if (!pane) return;
    editorStore.getState().setCanvasCenter({
      x: (pane.width / 2 - viewport.x) / viewport.zoom,
      y: (pane.height / 2 - viewport.y) / viewport.zoom,
    });
  }, []);

  const arrange = useCallback(async () => {
    const state = editorStore.getState();
    const doc = state.doc;
    if (!doc || doc.schema.tables.length === 0) return;
    const current = flow.getNodes();
    const tables = new Map(doc.schema.tables.map((t) => [t.id, t]));
    setArranging(true);
    try {
      const positions = await layoutInWorker({
        nodes: current.map((n) => {
          const table = tables.get(n.id);
          return {
            id: n.id,
            width: n.measured?.width ?? NODE_WIDTH,
            height:
              n.measured?.height ??
              (table ? estimateNodeHeight(table, n.data.layout.collapsed) : 120),
          };
        }),
        edges: doc.schema.tables.flatMap((t) =>
          t.foreignKeys.map((fk) => ({ id: fk.id, source: fk.refTable, target: t.id })),
        ),
      });
      const from = Object.fromEntries(current.map((n) => [n.id, n.position]));
      await animatePositions(
        from,
        positions,
        prefersReducedMotion() ? 0 : ARRANGE_DURATION_MS,
        (frame) => {
          setNodes((nds) =>
            nds.map((n) => {
              const position = frame[n.id];
              return position ? { ...n, position } : n;
            }),
          );
        },
      );
      editorStore.getState().setNodePositions(positions, 'Arrange tables');
      await flow.fitView({ ...FIT_OPTIONS, duration: prefersReducedMotion() ? 0 : 300 });
    } catch {
      toast.error('Could not arrange the tables.');
    } finally {
      setArranging(false);
    }
  }, [flow]);

  const runCommand = useCallback(
    (command: CanvasCommand) => {
      const duration = prefersReducedMotion() ? 0 : 200;
      switch (command) {
        case 'fitView':
          void flow.fitView({ ...FIT_OPTIONS, duration });
          break;
        case 'zoomIn':
          void flow.zoomIn({ duration });
          break;
        case 'zoomOut':
          void flow.zoomOut({ duration });
          break;
        case 'selectAll': {
          const ids = editorStore.getState().doc?.schema.tables.map((t) => t.id) ?? [];
          editorStore.getState().setCanvasSelection(ids);
          break;
        }
        case 'arrange':
          void arrange();
          break;
      }
    },
    [flow, arrange],
  );

  // Only commands issued while mounted count; one left in the store from before is stale.
  useEffect(
    () =>
      editorStore.subscribe((state, previous) => {
        const request = state.canvasCommand;
        if (!request || request === previous.canvasCommand) return;
        runCommand(request.command);
      }),
    [runCommand],
  );

  useEffect(
    () =>
      editorStore.subscribe((state, previous) => {
        const request = state.focusRequest;
        if (!request || request === previous.focusRequest) return;
        const node = state.doc?.layout.nodes[request.tableId];
        if (!node) return;
        state.setCanvasSelection([request.tableId]);
        void flow.setCenter(node.x + NODE_WIDTH / 2, node.y + 100, {
          zoom: Math.max(flow.getZoom(), 0.85),
          duration: prefersReducedMotion() ? 0 : 300,
        });
      }),
    [flow],
  );
  // Development only: lets e2e specs load the stress fixture and drive the viewport.
  useEffect(() => {
    if (!TEST_HOOKS) return;
    const hook = {
      setViewport: flow.setViewport,
      getViewport: flow.getViewport,
      fitView: flow.fitView,
      /** Replaces the schema with `count` stress tables and arranges them. */
      loadStress: async (count: number) => {
        const { stressSchema } = await import('./stress-fixture');
        const state = editorStore.getState();
        state.editSchema('Load stress fixture', () => stressSchema(count));
        state.runCanvasCommand('arrange');
      },
    };
    Object.assign(window, { __dashdbCanvas: hook });
    return () => {
      Reflect.deleteProperty(window, '__dashdbCanvas');
    };
  }, [flow]);

  useEffect(() => {
    if (takeArrangeIntent(projectId)) editorStore.getState().runCanvasCommand('arrange');
  }, [projectId]);

  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (isEditableTarget(event.target) || event.ctrlKey || event.metaKey || event.altKey) return;
    const state = editorStore.getState();
    if (event.key === 'Delete' || event.key === 'Backspace') {
      const ids = selectedTableIds(state);
      if (ids.length === 0) return;
      event.preventDefault();
      state.requestDeleteTables(ids);
    } else if (event.key === 'Escape' && state.canvasSelection.length > 0) {
      state.setCanvasSelection([]);
      state.select(null);
    }
  };

  const tableCount = schema?.tables.length ?? 0;

  return (
    <section
      aria-label="Canvas"
      data-testid="canvas"
      className="relative h-full bg-background"
      onKeyDown={onKeyDown}
    >
      <RelationshipMarkers />
      <ReactFlow<TableFlowNode, RelationshipFlowEdge>
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        proOptions={PRO_OPTIONS}
        onNodesChange={onNodesChange}
        onNodeDragStop={onNodeDragStop}
        onConnect={onConnect}
        isValidConnection={isValidConnection}
        onEdgeMouseEnter={onEdgeMouseEnter}
        onEdgeMouseLeave={onEdgeMouseLeave}
        onNodeContextMenu={(event, node) => {
          event.preventDefault();
          const state = editorStore.getState();
          if (state.canvasSelection.length > 1 && state.canvasSelection.includes(node.id)) {
            openMenu({ kind: 'selection', x: event.clientX, y: event.clientY });
            return;
          }
          state.setCanvasSelection([node.id]);
          state.select(node.id);
          openMenu({ kind: 'table', tableId: node.id, x: event.clientX, y: event.clientY });
        }}
        onSelectionContextMenu={(event) => {
          event.preventDefault();
          openMenu({ kind: 'selection', x: event.clientX, y: event.clientY });
        }}
        onEdgeContextMenu={(event, edge) => {
          event.preventDefault();
          openMenu({ kind: 'edge', edgeId: edge.id, x: event.clientX, y: event.clientY });
        }}
        onPaneContextMenu={(event) => {
          event.preventDefault();
          const point = flow.screenToFlowPosition({ x: event.clientX, y: event.clientY });
          openMenu({
            kind: 'pane',
            x: event.clientX,
            y: event.clientY,
            flow: { x: snap(point.x), y: snap(point.y) },
          });
        }}
        onInit={(instance) => {
          updateCenter(null, instance.getViewport());
        }}
        onMoveEnd={updateCenter}
        connectionMode={ConnectionMode.Loose}
        connectionLineType={ConnectionLineType.SmoothStep}
        colorMode={resolvedTheme === 'dark' ? 'dark' : 'light'}
        snapToGrid
        snapGrid={SNAP_GRID}
        onlyRenderVisibleElements
        fitView
        fitViewOptions={FIT_OPTIONS}
        minZoom={0.05}
        maxZoom={2}
        zoomOnDoubleClick={false}
        deleteKeyCode={null}
        multiSelectionKeyCode={['Meta', 'Control', 'Shift']}
        selectionKeyCode="Shift"
        nodeDragThreshold={2}
        elevateEdgesOnSelect
        attributionPosition="bottom-center"
      >
        <Background variant={BackgroundVariant.Dots} gap={GRID_SIZE} size={1} />
        <Controls showInteractive={false} fitViewOptions={FIT_OPTIONS} aria-label="Zoom controls" />
        <MiniMap
          pannable
          zoomable
          ariaLabel="Minimap"
          nodeBorderRadius={6}
          className="!border !border-border !bg-surface"
        />
        {tableCount > 0 && (
          <Panel position="top-left" className="flex gap-1">
            <Button
              variant="outline"
              size="sm"
              className="bg-surface-raised"
              title="Arrange tables automatically"
              aria-keyshortcuts={ariaShortcut(getAction('view.arrange').shortcut, isMacPlatform())}
              disabled={arranging}
              onClick={() => {
                void arrange();
              }}
            >
              {arranging ? (
                <Loader2Icon className="animate-spin" aria-hidden />
              ) : (
                <LayoutGridIcon aria-hidden />
              )}
              Arrange
            </Button>
            <ActionButton
              action="view.fitView"
              variant="outline"
              size="icon-sm"
              className="bg-surface-raised"
            >
              <MaximizeIcon aria-hidden />
            </ActionButton>
          </Panel>
        )}
        {tableCount === 0 && <EmptyState />}
        <MigrationGhosts />
      </ReactFlow>
      <CanvasContextMenu />
      <ConnectPopover />
      <DeleteTablesDialog />
    </section>
  );
}

export function Canvas() {
  const projectId = useEditor((s) => s.projectId);
  if (!projectId) return null;
  return (
    <ReactFlowProvider>
      <CanvasFlow key={projectId} projectId={projectId} />
    </ReactFlowProvider>
  );
}
