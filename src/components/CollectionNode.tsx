import React, { memo, useEffect, useRef, useState } from 'react';
import { Handle, Position, type Node, type NodeProps } from '@xyflow/react';
import { Copy, MoreHorizontal, Pencil, Plus, Trash2 } from 'lucide-react';
import type { FieldType, SchemaField } from '../types';
import { useSchemaStore } from '../store/useSchemaStore';
import { useUIStore } from '../store/useUIStore';
import { useNodeFocus } from '../hooks/useFocus';
import { ACCENT_PALETTE, accentFor, iconFor } from './nodeVisuals';
import { useSchemaAudit, type AuditIssue } from '../utils/schemaAuditor';

/** Node payload is just an id; everything else is read from the store. */
export type CollectionNodeData = { collectionId: string };

const actions = () => useSchemaStore.getState();

const FIELD_TYPES: FieldType[] = ['String', 'Number', 'Boolean', 'Date', 'ObjectId', 'Array', 'Enum', 'JSON', 'Decimal', 'UUID'];

const HANDLE_STYLE = { width: 8, height: 8, background: 'var(--accent-primary)', border: '2px solid var(--bg-surface)' };

/** Parses the quick-add shorthand `name` or `name: Type` (type is case-insensitive). */
function parseQuickField(input: string): { name: string; type: FieldType } | null {
  const [rawName, rawType] = input.split(':').map((s) => s.trim());
  if (!rawName) return null;
  const type = FIELD_TYPES.find((t) => t.toLowerCase() === rawType?.toLowerCase()) ?? 'String';
  return { name: rawName.replace(/\s+/g, '_'), type };
}

export const CollectionNode = memo(({ data }: NodeProps<Node<CollectionNodeData>>) => {
  const { collectionId } = data;
  // Each selector returns a stable value unless *this* node's data changed,
  // so editing one collection never re-renders the others.
  const col = useSchemaStore((s) => s.collections.find((c) => c.id === collectionId));
  const isColSelected = useSchemaStore((s) => s.selectedCollectionId === collectionId);
  const selectedFieldId = useSchemaStore((s) => (s.selectedCollectionId === collectionId ? s.selectedFieldId : null));
  const searchQuery = useUIStore((s) => s.searchQuery);
  const focus = useNodeFocus(collectionId);
  const audit = useSchemaAudit();
  const colIssues = audit.collectionIssueMap.get(collectionId) ?? [];
  const hasCritical = colIssues.some((i) => i.severity === 'critical');

  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState('');
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [draftField, setDraftField] = useState('');
  const cardRef = useRef<HTMLDivElement>(null);

  // Close the action menu on any outside click.
  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    window.addEventListener('pointerdown', close);
    return () => window.removeEventListener('pointerdown', close);
  }, [menu]);

  // Node may render for one frame after its collection is removed.
  if (!col) return null;

  const accent = accentFor(col.colorTag);
  const Icon = iconFor(col.icon);
  const q = searchQuery.trim().toLowerCase();
  const matchesSearch = !q || col.name.toLowerCase().includes(q) || col.fields.some((f) => f.name.toLowerCase().includes(q));
  const isDimmed = !matchesSearch || focus === 'dimmed';

  const startEditing = () => {
    setEditName(col.name);
    setIsEditing(true);
    setMenu(null);
  };
  const commitRename = () => {
    setIsEditing(false);
    actions().updateCollection(col.id, { name: editName });
  };

  const commitDraftField = () => {
    const parsed = parseQuickField(draftField);
    if (parsed) actions().addField(col.id, parsed);
    setDraftField('');
  };

  const openMenuAt = (clientX: number, clientY: number) => {
    const el = cardRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    // The menu lives inside the zoom-scaled node, so convert to node-local units.
    const scale = rect.width / (el.offsetWidth || rect.width);
    setMenu({ x: (clientX - rect.left) / scale, y: (clientY - rect.top) / scale });
  };

  const stateClass = isColSelected ? 'is-selected' : isDimmed ? 'is-dimmed' : focus === 'related' ? 'is-related' : '';

  return (
    <div
      ref={cardRef}
      onClick={() => actions().setSelectedField(null, col.id)}
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
        openMenuAt(e.clientX, e.clientY);
      }}
      className={`sf-node group relative w-[300px] ${stateClass}`}
    >
      {/* Header (drag handle) with restrained 2px domain rule */}
      <div
        className="drag-handle flex h-11 cursor-grab items-center gap-2.5 rounded-t-[7px] border-b border-line bg-surface-subtle px-3 active:cursor-grabbing"
        style={{ boxShadow: `inset 0 2px 0 ${accent}` }}
      >
        <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-[5px] border border-line bg-surface text-fg-secondary">
          <Icon className="h-3.5 w-3.5" />
        </div>

        <div className="min-w-0 flex-1" onDoubleClick={(e) => { e.stopPropagation(); startEditing(); }}>
          {isEditing ? (
            <input
              autoFocus
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              onBlur={commitRename}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitRename();
                if (e.key === 'Escape') setIsEditing(false);
              }}
              onClick={(e) => e.stopPropagation()}
              aria-label="Collection name"
              className="nodrag field-input !h-7 !px-1.5 text-[13px] font-semibold"
            />
          ) : (
            <div className="truncate text-[13px] font-semibold tracking-[-0.01em] text-fg" title={`${col.name} — double-click to rename`}>
              {col.name}
            </div>
          )}
        </div>

        <span className="tabular shrink-0 rounded-[4px] border border-line bg-surface px-1.5 py-px font-mono text-[10.5px] text-fg-secondary">
          {col.fields.length} {col.fields.length === 1 ? 'field' : 'fields'}
        </span>

        {colIssues.length > 0 && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              useUIStore.getState().setAuditorOpen(true);
              useUIStore.getState().setFocusedIssueId(colIssues[0].id);
            }}
            title={`${colIssues.length} MongoDB audit issue${colIssues.length > 1 ? 's' : ''} on ${col.name} — Click to inspect in Auditor`}
            className={`nodrag flex h-5 items-center gap-1 rounded-[4px] px-1.5 font-mono text-[10px] font-semibold transition ${
              hasCritical
                ? 'border border-danger/40 bg-danger/15 text-danger hover:bg-danger/25'
                : 'border border-amber-500/40 bg-amber-500/15 text-amber-400 hover:bg-amber-500/25'
            }`}
          >
            <span className={`h-1.5 w-1.5 rounded-full ${hasCritical ? 'bg-danger' : 'bg-amber-400'}`} />
            {colIssues.length}
          </button>
        )}

        <button
          type="button"
          aria-label="Collection actions"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            if (menu) setMenu(null);
            else {
              const r = e.currentTarget.getBoundingClientRect();
              openMenuAt(r.right - 192 * (r.width / e.currentTarget.offsetWidth), r.bottom + 4);
            }
          }}
          data-open={!!menu || isColSelected}
          className="nodrag -mr-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-control text-fg-secondary opacity-0 transition hover:bg-surface-hover hover:text-fg group-hover:opacity-100 data-[open=true]:opacity-100"
        >
          <MoreHorizontal className="h-4 w-4" />
        </button>
      </div>

      {/* Field rows */}
      <div className="py-1">
        {col.fields.map((field) => (
          <FieldRow
            key={field.id}
            field={field}
            issue={audit.fieldIssueMap.get(`${col.id}:${field.id}`)?.[0]}
            isSelected={selectedFieldId === field.id}
            isSearchHit={!!q && field.name.toLowerCase().includes(q)}
            onSelect={() => actions().setSelectedField(field.id, col.id)}
          />
        ))}
      </div>

      {/* Inline quick-add */}
      <div className="border-t border-line px-2 py-1.5">
        {isAdding ? (
          <input
            autoFocus
            value={draftField}
            placeholder="fieldName: Type  ↵"
            aria-label="New field (name: Type)"
            onChange={(e) => setDraftField(e.target.value)}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitDraftField();
              if (e.key === 'Escape') {
                setDraftField('');
                setIsAdding(false);
              }
            }}
            onBlur={() => {
              if (draftField.trim()) commitDraftField();
              setIsAdding(false);
            }}
            className="nodrag field-input !h-7 !px-2 font-mono text-[11.5px]"
          />
        ) : (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setIsAdding(true);
            }}
            className="nodrag flex h-7 w-full items-center gap-1.5 rounded-control px-2 text-[12px] text-fg-secondary transition hover:bg-surface-subtle hover:text-fg"
          >
            <Plus className="h-3.5 w-3.5" />
            Add field
          </button>
        )}
      </div>

      {/* Action menu (⋯ or right-click) */}
      {menu && (
        <div
          className="nodrag popover absolute z-50 w-48 p-1 text-[12.5px]"
          style={{ top: menu.y, left: Math.max(0, menu.x) }}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
        >
          <MenuItem icon={Plus} label="Add field" onClick={() => { setMenu(null); setIsAdding(true); }} />
          <MenuItem icon={Pencil} label="Rename" onClick={startEditing} />
          <MenuItem icon={Copy} label="Duplicate" onClick={() => { setMenu(null); actions().duplicateCollection(col.id); }} />
          <div className="my-1 border-y border-line px-2 pt-2 pb-2.5">
            <div className="mb-2 text-[11px] font-medium text-fg-secondary">Domain color</div>
            <div className="flex flex-wrap gap-2">
              {ACCENT_PALETTE.map((c) => (
                <button
                  key={c.value}
                  type="button"
                  aria-label={c.name}
                  title={c.name}
                  onClick={() => {
                    actions().updateCollection(col.id, { colorTag: c.value });
                    setMenu(null);
                  }}
                  className="h-4 w-4 rounded-full border border-line transition hover:scale-110"
                  style={{
                    background: c.value,
                    outline: accent === c.value ? '1.5px solid var(--text-primary)' : undefined,
                    outlineOffset: 2,
                  }}
                />
              ))}
            </div>
          </div>
          <MenuItem icon={Trash2} label="Delete collection" danger onClick={() => { setMenu(null); actions().deleteCollection(col.id); }} />
        </div>
      )}
    </div>
  );
});

const FieldRow = memo(function FieldRow({
  field,
  issue,
  isSelected,
  isSearchHit,
  onSelect,
}: {
  field: SchemaField;
  issue?: AuditIssue;
  isSelected: boolean;
  isSearchHit: boolean;
  onSelect: () => void;
}) {
  const required = !!field.validation.required;
  const indexed = !!field.index?.indexed || field.index?.ttlSeconds !== undefined;
  const typeLabel = field.type === 'Array' && field.array?.itemType ? `${field.array.itemType}[]` : field.type;

  return (
    <div
      onClick={(e) => {
        e.stopPropagation();
        onSelect();
      }}
      className={`relative flex h-8 cursor-pointer items-center gap-2 px-3 transition-colors ${
        isSelected
          ? 'bg-accent-soft shadow-[inset_2px_0_0_var(--accent-primary)]'
          : isSearchHit
            ? 'bg-surface-subtle'
            : 'hover:bg-surface-subtle'
      }`}
    >
      {/* Parent output on the right, child input on the left */}
      <Handle type="target" position={Position.Left} id={`target-${field.id}`} style={{ ...HANDLE_STYLE, left: -5 }} />
      <Handle type="source" position={Position.Right} id={`source-${field.id}`} style={{ ...HANDLE_STYLE, right: -5 }} />

      <span
        className={`h-[5px] w-[5px] shrink-0 rounded-full ${required ? 'bg-danger' : ''}`}
        title={required ? 'Required' : undefined}
        aria-label={required ? 'Required' : undefined}
      />
      <span className="min-w-0 flex-1 truncate text-[12.5px] font-medium text-fg" title={field.name}>
        {field.name}
      </span>
      <span className="shrink-0 font-mono text-[11.5px] text-fg-secondary">{typeLabel}</span>
      {(field.isPrimaryKey || field.isForeignKey || indexed || field.validation.unique) && (
        <span className="flex shrink-0 items-center gap-1">
          {field.isPrimaryKey && <span className="badge badge-pk">PK</span>}
          {field.isForeignKey && <span className="badge badge-fk">FK</span>}
          {indexed && <span className="badge badge-idx">IDX</span>}
          {field.validation.unique && !field.isPrimaryKey && <span className="badge badge-uniq">UNIQ</span>}
        </span>
      )}
      {issue && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            useUIStore.getState().setAuditorOpen(true);
            useUIStore.getState().setFocusedIssueId(issue.id);
          }}
          title={`${issue.title} — Click to inspect in Auditor`}
          className={`nodrag flex h-[18px] shrink-0 items-center gap-1 rounded-[3px] px-1 font-mono text-[9px] font-semibold transition ${
            issue.severity === 'critical'
              ? 'border border-danger/40 bg-danger/15 text-danger hover:bg-danger/25'
              : 'border border-amber-500/40 bg-amber-500/15 text-amber-400 hover:bg-amber-500/25'
          }`}
        >
          <span className={`h-1 w-1 rounded-full ${issue.severity === 'critical' ? 'bg-danger' : 'bg-amber-400'}`} />
          {issue.ruleCode === 'UNBOUNDED_ARRAY'
            ? 'ARRAY!'
            : issue.ruleCode === 'MISSING_FK_INDEX'
              ? 'NO-IDX'
              : issue.ruleCode === 'SENSITIVE_FIELD_EXPOSED'
                ? 'EXPOSED'
                : 'AUDIT'}
        </button>
      )}
    </div>
  );
});

function MenuItem({
  icon: Icon,
  label,
  onClick,
  danger,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center gap-2 rounded-[5px] px-2 py-1.5 text-left transition ${
        danger ? 'text-danger hover:bg-danger-soft' : 'text-fg hover:bg-surface-hover'
      }`}
    >
      <Icon className="h-3.5 w-3.5" />
      {label}
    </button>
  );
}
