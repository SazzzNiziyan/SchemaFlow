import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  ReactFlow,
  MiniMap,
  Background,
  Connection,
  Edge,
  Node,
  BackgroundVariant,
  NodeChange,
  EdgeChange,
  applyNodeChanges,
  applyEdgeChanges,
  useReactFlow,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import type { CollectionNode as CollectionModel, XYPosition } from '../types';
import { CollectionNode, type CollectionNodeData } from './CollectionNode';
import { CustomEdge, type CustomEdgeData } from './CustomEdge';
import { useSchemaStore } from '../store/useSchemaStore';
import { useUIStore } from '../store/useUIStore';
import { useInspectorVisible } from './FieldInspector';
import { deriveRelationships } from '../utils/schemaOps';
import { hudFitPadding, LAYOUT_TWEEN_MS } from '../hooks/useCanvasCommands';

type CollectionFlowNode = Node<CollectionNodeData, 'collectionNode'>;
type RelationshipFlowEdge = Edge<CustomEdgeData, 'customEdge'>;

const nodeTypes = { collectionNode: CollectionNode };
const edgeTypes = { customEdge: CustomEdge };

// Edge/connection colors come from theme tokens (see .sf-edge-path in index.css).
const CONNECTION_LINE_STYLE = { stroke: 'var(--accent-primary)', strokeWidth: 1.5, strokeDasharray: '5 4' };
const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);

function makeNode(col: CollectionModel, position: XYPosition, existing?: CollectionFlowNode): CollectionFlowNode {
  if (existing) return existing.position === position ? existing : { ...existing, position };
  return {
    id: col.id,
    type: 'collectionNode',
    position,
    data: { collectionId: col.id },
    dragHandle: '.drag-handle',
    selected: useSchemaStore.getState().selectedCollectionId === col.id,
  };
}

export const Canvas: React.FC = () => {
  const collections = useSchemaStore((s) => s.collections);
  const selectedCollectionId = useSchemaStore((s) => s.selectedCollectionId);
  const inspectorVisible = useInspectorVisible();
  const { screenToFlowPosition } = useReactFlow();

  // React Flow owns transient node state (drag positions, measured size,
  // selection); the store is only written on drag-stop.
  const [nodes, setNodes] = useState<CollectionFlowNode[]>([]);
  const [edges, setEdges] = useState<RelationshipFlowEdge[]>([]);
  // Computed once: initial framing respects the HUD (incl. an initially open inspector).
  const [fitViewOptions] = useState(() => ({ padding: hudFitPadding(), maxZoom: 1.1 }));
  const nodesRef = useRef(nodes);
  nodesRef.current = nodes;
  const tweenRef = useRef<number | null>(null);

  // Store → React Flow. After a layout pass, nodes glide to their new
  // positions; edges follow because React Flow derives them from node positions.
  useEffect(() => {
    const animate = useUIStore.getState().animateNextLayout;
    if (animate) useUIStore.setState({ animateNextLayout: false });
    if (tweenRef.current !== null) cancelAnimationFrame(tweenRef.current);
    tweenRef.current = null;

    const from = new Map<string, XYPosition>(nodesRef.current.map((n) => [n.id, n.position]));
    const moving =
      animate &&
      !window.matchMedia('(prefers-reduced-motion: reduce)').matches &&
      collections.some((c) => {
        const f = from.get(c.id);
        return f && (f.x !== c.position.x || f.y !== c.position.y);
      });

    if (!moving) {
      setNodes((prev) => {
        const byId = new Map<string, CollectionFlowNode>(prev.map((n) => [n.id, n]));
        return collections.map((col) => makeNode(col, col.position, byId.get(col.id)));
      });
    } else {
      const start = performance.now();
      const step = (now: number) => {
        const t = Math.min(1, (now - start) / LAYOUT_TWEEN_MS);
        const e = easeOutCubic(t);
        setNodes((prev) => {
          const byId = new Map<string, CollectionFlowNode>(prev.map((n) => [n.id, n]));
          return collections.map((col) => {
            const f = from.get(col.id);
            const position =
              t >= 1 || !f ? col.position : { x: f.x + (col.position.x - f.x) * e, y: f.y + (col.position.y - f.y) * e };
            return makeNode(col, position, byId.get(col.id));
          });
        });
        tweenRef.current = t < 1 ? requestAnimationFrame(step) : null;
      };
      tweenRef.current = requestAnimationFrame(step);
    }

    setEdges((prev) => {
      const selected = new Set(prev.filter((e) => e.selected).map((e) => e.id));
      // Visual edge runs parent (source handle, right) → child (target handle, left).
      return deriveRelationships(collections).map((rel) => ({
        id: rel.id,
        source: rel.targetCollectionId,
        sourceHandle: `source-${rel.targetFieldId}`,
        target: rel.sourceCollectionId,
        targetHandle: `target-${rel.sourceFieldId}`,
        type: 'customEdge',
        selected: selected.has(rel.id),
        data: { relType: rel.type },
      }));
    });
  }, [collections]);

  useEffect(() => () => {
    if (tweenRef.current !== null) cancelAnimationFrame(tweenRef.current);
  }, []);

  // Mirror app selection into React Flow so the selected node is elevated and shows its handles.
  useEffect(() => {
    setNodes((nds) => {
      let changed = false;
      const next = nds.map((n) => {
        const selected = n.id === selectedCollectionId;
        if (!!n.selected === selected) return n;
        changed = true;
        return { ...n, selected };
      });
      return changed ? next : nds;
    });
  }, [selectedCollectionId]);

  const onNodesChange = useCallback(
    (changes: NodeChange<CollectionFlowNode>[]) => setNodes((nds) => applyNodeChanges(changes, nds)),
    [],
  );

  const onEdgesChange = useCallback(
    (changes: EdgeChange<RelationshipFlowEdge>[]) => setEdges((eds) => applyEdgeChanges(changes, eds)),
    [],
  );

  const onConnect = useCallback((params: Connection) => {
    if (!params.source || !params.target || !params.sourceHandle || !params.targetHandle) return;
    if (params.source === params.target && params.sourceHandle.slice(7) === params.targetHandle.slice(7)) return;
    // Visual source is the parent; the store models the child field as the relationship source.
    useSchemaStore.getState().addRelationship({
      sourceCollectionId: params.target,
      sourceFieldId: params.targetHandle.replace('target-', ''),
      targetCollectionId: params.source,
      targetFieldId: params.sourceHandle.replace('source-', ''),
    });
  }, []);

  const onNodeDragStop = useCallback((_event: React.MouseEvent, node: Node) => {
    useSchemaStore.getState().updateCollection(node.id, { position: { x: node.position.x, y: node.position.y } });
  }, []);

  const onPaneClick = useCallback(() => {
    useSchemaStore.getState().setSelectedCollection(null);
    useUIStore.getState().closeCreateCollection();
  }, []);

  const onNodeMouseEnter = useCallback((_e: React.MouseEvent, node: Node) => {
    useUIStore.getState().setHoveredCollectionId(node.id);
  }, []);
  const onNodeMouseLeave = useCallback(() => {
    useUIStore.getState().setHoveredCollectionId(null);
  }, []);

  /** Double-click empty canvas → inline "new collection" popover at the cursor. */
  const onDoubleClick = useCallback(
    (e: React.MouseEvent) => {
      if (!(e.target as HTMLElement).classList.contains('react-flow__pane')) return;
      useUIStore.getState().openCreateCollection({
        screen: { x: e.clientX, y: e.clientY },
        flow: screenToFlowPosition({ x: e.clientX, y: e.clientY }),
      });
    },
    [screenToFlowPosition],
  );

  return (
    <div className="fixed inset-0 bg-canvas">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodeDragStop={onNodeDragStop}
        onPaneClick={onPaneClick}
        onNodeMouseEnter={onNodeMouseEnter}
        onNodeMouseLeave={onNodeMouseLeave}
        onDoubleClick={onDoubleClick}
        zoomOnDoubleClick={false}
        // Deletion is owned by useKeyboardShortcuts so it is undoable as one step.
        deleteKeyCode={null}
        fitView
        fitViewOptions={fitViewOptions}
        minZoom={0.1}
        maxZoom={2}
        defaultEdgeOptions={{ type: 'customEdge' }}
        connectionLineStyle={CONNECTION_LINE_STYLE}
        snapToGrid
        snapGrid={[10, 10]}
      >
        <Background variant={BackgroundVariant.Dots} gap={20} size={1.4} />
        {!inspectorVisible && (
          <MiniMap
            position="bottom-right"
            pannable
            zoomable
            style={{ width: 168, height: 108, marginBottom: 28 }}
            nodeBorderRadius={4}
          />
        )}
      </ReactFlow>
    </div>
  );
};
