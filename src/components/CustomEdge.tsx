import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { BaseEdge, EdgeLabelRenderer, EdgeProps, getBezierPath, type Edge } from '@xyflow/react';
import { Trash2 } from 'lucide-react';
import type { RelationshipType } from '../types';
import { useSchemaStore } from '../store/useSchemaStore';
import { useEdgeFocus } from '../hooks/useFocus';
import { RELATIONSHIP_LABELS } from '../utils/schemaOps';

/** Edge ids are relationship ids, so the edge can edit/delete itself via the store. */
export type CustomEdgeData = { relType: RelationshipType };

const CARDINALITIES: { type: RelationshipType; hint: string }[] = [
  { type: 'one-to-one', hint: 'One to one' },
  { type: 'one-to-many', hint: 'One to many' },
  { type: 'many-to-many', hint: 'Many to many' },
];

export const CustomEdge = ({
  id,
  source,
  target,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style = {},
  markerEnd,
  selected,
  data,
}: EdgeProps<Edge<CustomEdgeData>>) => {
  const dx = targetX - sourceX;
  const dy = Math.abs(targetY - sourceY);
  // When target is to the left or directly stacked across rows, clamp curvature
  // so tangent bezier handles never swing into neighboring columns.
  const curvature = dx < 50 ? Math.min(0.18, Math.max(0.08, 40 / Math.max(dy, 100))) : 0.35;

  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
    curvature,
  });
  const focus = useEdgeFocus(source, target);
  // Menu is portalled to <body> (anchored to the pill) so selected nodes, which
  // React Flow elevates above the edge-label layer, can never cover it.
  const [menuAt, setMenuAt] = useState<{ x: number; y: number } | null>(null);
  const menuOpen = menuAt !== null;
  const setMenuOpen = (open: boolean) => !open && setMenuAt(null);
  const [labelHover, setLabelHover] = useState(false);

  useEffect(() => {
    if (!menuOpen) return;
    const close = () => setMenuAt(null);
    window.addEventListener('pointerdown', close);
    window.addEventListener('wheel', close, { passive: true });
    window.addEventListener('resize', close);
    return () => {
      window.removeEventListener('pointerdown', close);
      window.removeEventListener('wheel', close);
      window.removeEventListener('resize', close);
    };
  }, [menuOpen]);

  const relType = data?.relType ?? 'one-to-many';
  const isActive = focus === 'focus' || !!selected || labelHover || menuOpen;
  const dimClass = focus === 'dimmed' && !isActive ? 'is-dimmed' : '';

  return (
    <>
      <BaseEdge
        path={edgePath}
        markerEnd={markerEnd}
        style={style}
        interactionWidth={18}
        className={`sf-edge-path ${isActive ? 'is-active' : ''} ${dimClass}`}
      />
      <EdgeLabelRenderer>
        <div
          style={{
            position: 'absolute',
            transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
            pointerEvents: 'all',
          }}
          className={`sf-edge-label nodrag nopan ${dimClass}`}
          onMouseEnter={() => setLabelHover(true)}
          onMouseLeave={() => setLabelHover(false)}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            title="Change cardinality"
            onClick={(e) => {
              e.stopPropagation();
              const r = e.currentTarget.getBoundingClientRect();
              setMenuAt(menuOpen ? null : { x: r.left + r.width / 2, y: r.bottom + 6 });
            }}
            className={`tabular rounded-[4px] border bg-surface px-1.5 py-px font-mono text-[10.5px] font-medium tracking-[0.02em] transition-colors ${
              isActive ? 'border-accent text-accent' : 'border-line-strong text-fg-secondary hover:border-accent hover:text-fg'
            }`}
          >
            {RELATIONSHIP_LABELS[relType]}
          </button>

          {menuAt && createPortal(
            <div
              role="menu"
              aria-label="Relationship cardinality"
              className="popover fixed z-[60] w-44 -translate-x-1/2 p-1 text-[12.5px]"
              style={{ left: menuAt.x, top: menuAt.y }}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => e.stopPropagation()}
            >
              {CARDINALITIES.map((c) => (
                <button
                  key={c.type}
                  type="button"
                  onClick={() => {
                    useSchemaStore.getState().updateRelationship(id, { type: c.type });
                    setMenuOpen(false);
                  }}
                  aria-pressed={c.type === relType}
                  className={`flex w-full items-center justify-between rounded-[5px] px-2 py-1.5 transition ${
                    c.type === relType ? 'bg-accent-soft text-fg' : 'text-fg hover:bg-surface-hover'
                  }`}
                >
                  <span>{c.hint}</span>
                  <span className="font-mono text-[11px] text-fg-secondary">{RELATIONSHIP_LABELS[c.type]}</span>
                </button>
              ))}
              <div className="my-1 border-t border-line" />
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false);
                  useSchemaStore.getState().deleteRelationship(id);
                }}
                className="flex w-full items-center gap-2 rounded-[5px] px-2 py-1.5 text-danger transition hover:bg-danger-soft"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Remove relation
              </button>
            </div>,
            document.body,
          )}
        </div>
      </EdgeLabelRenderer>
    </>
  );
};
