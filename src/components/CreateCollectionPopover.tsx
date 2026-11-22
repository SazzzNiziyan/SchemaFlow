import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Table2 } from 'lucide-react';
import type { CollectionNode, SchemaField } from '../types';
import { useSchemaStore } from '../store/useSchemaStore';
import { useUIStore } from '../store/useUIStore';
import { createId } from '../utils/schemaOps';
import { findFreePosition, NODE_WIDTH } from '../utils/autoLayout';
import { ACCENT_COLORS } from './nodeVisuals';

type PkType = 'ObjectId' | 'UUID' | 'Number';
const PK_TYPES: PkType[] = ['ObjectId', 'UUID', 'Number'];

/** Builds a new collection with a primary key, `name`, and `createdAt`. */
export function buildCollection(rawName: string, pkType: PkType, colorIndex: number): CollectionNode {
  const trimmed = rawName.trim();
  const name = trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
  const fields: SchemaField[] = [
    { id: createId('f'), name: pkType === 'ObjectId' ? '_id' : 'id', type: pkType, isPrimaryKey: true, validation: { required: true } },
    { id: createId('f'), name: 'name', type: 'String', validation: { required: true } },
    { id: createId('f'), name: 'createdAt', type: 'Date', validation: { defaultVal: 'Date.now' } },
  ];
  return {
    id: createId('col'),
    name,
    icon: 'Table',
    colorTag: ACCENT_COLORS[colorIndex % ACCENT_COLORS.length],
    position: { x: 0, y: 0 },
    fields,
  };
}

/**
 * Inline "new collection" popover, anchored where the user double-clicked
 * the canvas or above the dock's "Collection" button. Replaces the old modal.
 */
export const CreateCollectionPopover: React.FC = () => {
  const anchor = useUIStore((s) => s.createCollectionAt);
  const close = useUIStore((s) => s.closeCreateCollection);
  const [name, setName] = useState('');
  const [pkType, setPkType] = useState<PkType>('ObjectId');
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const ref = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (anchor) {
      setName('');
      setPkType('ObjectId');
    }
  }, [anchor]);

  // Place next to the anchor, flipping above it near the bottom edge and clamping to the viewport.
  useLayoutEffect(() => {
    if (!anchor || !ref.current) return setPos(null);
    const { offsetWidth: w, offsetHeight: h } = ref.current;
    const margin = 12;
    const above = anchor.screen.y + h + margin > window.innerHeight - 80;
    const top = above ? anchor.screen.y - h - margin : anchor.screen.y + margin;
    const left = Math.min(Math.max(margin, anchor.screen.x - w / 2), window.innerWidth - w - margin);
    setPos({ left, top: Math.max(64, top) });
  }, [anchor]);

  useEffect(() => {
    if (!anchor) return;
    const onDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) close();
    };
    window.addEventListener('pointerdown', onDown);
    return () => window.removeEventListener('pointerdown', onDown);
  }, [anchor, close]);

  if (!anchor) return null;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    const state = useSchemaStore.getState();
    const col = buildCollection(name, pkType, state.collections.length);
    const desired = { x: Math.round(anchor.flow.x - NODE_WIDTH / 2), y: Math.round(anchor.flow.y - 40) };
    state.addCollection(col, { position: findFreePosition(state.collections, desired, col.fields.length) });
    close();
  };

  return (
    <form
      ref={ref}
      onSubmit={submit}
      role="dialog"
      aria-label="New collection"
      onKeyDown={(e) => e.key === 'Escape' && close()}
      className="popover fixed z-50 w-72 p-3"
      style={pos ? { left: pos.left, top: pos.top } : { left: -9999, top: -9999 }}
    >
      <div className="mb-2.5 flex items-center gap-2 text-[13px] font-semibold tracking-[-0.01em] text-fg">
        <Table2 className="h-4 w-4 text-fg-secondary" />
        New collection
      </div>
      <input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="e.g. orders"
        aria-label="Collection name"
        className="field-input"
      />
      <div className="mt-2.5">
        <span className="panel-label">Primary key</span>
        <div className="segmented">
          {PK_TYPES.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setPkType(t)}
              aria-pressed={pkType === t}
              className="font-mono"
            >
              {t}
            </button>
          ))}
        </div>
      </div>
      <div className="mt-3 flex items-center justify-between">
        <span className="text-[11px] text-fg-secondary">
          <span className="kbd">↵</span> create · <span className="kbd">Esc</span> cancel
        </span>
        <button
          type="submit"
          disabled={!name.trim()}
          className="btn btn-primary !h-7"
        >
          Create
        </button>
      </div>
    </form>
  );
};
