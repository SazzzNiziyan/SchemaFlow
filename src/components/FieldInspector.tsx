import React, { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ArrowRight, ChevronDown, ChevronRight, Copy, PanelRightClose, PanelRightOpen, Plus, Route, Trash2, WandSparkles, X } from 'lucide-react';
import type { CollectionNode, FieldType, RelationshipType, SchemaField } from '../types';
import { useSchemaStore } from '../store/useSchemaStore';
import { AUDITOR_WIDTH, INSPECTOR_WIDTH, SIDE_BY_SIDE_QUERY, useUIStore } from '../store/useUIStore';
import { useMediaQuery } from '../hooks/useMediaQuery';
import { countRelationships, relationshipIdForField, RELATIONSHIP_LABELS } from '../utils/schemaOps';
import { ACCENT_COLORS, COLLECTION_ICONS, accentFor, iconFor } from './nodeVisuals';
import { openApiBuilder } from '../hooks/useApiBuilder';
import { collectionBasePath } from '../utils/apiCodeGenerator';
import { MethodBadge } from './api/apiUi';

const DATA_TYPES: FieldType[] = ['String', 'Number', 'Boolean', 'Date', 'ObjectId', 'Array', 'Enum', 'JSON', 'Decimal', 'UUID'];
const actions = () => useSchemaStore.getState();

/** True when the inspector panel is on screen (something selected and not collapsed). */
export function useInspectorVisible(): boolean {
  const hasSelection = useSchemaStore(
    (s) => !!s.selectedCollectionId && s.collections.some((c) => c.id === s.selectedCollectionId),
  );
  const collapsed = useUIStore((s) => s.isInspectorCollapsed);
  return hasSelection && !collapsed;
}

/**
 * Right offset of the inspector. The Schema Auditor is docked at the same
 * edge, so when it is open the inspector moves to its left (if the screen is
 * wide enough) instead of being drawn underneath it.
 */
function useInspectorRight(): { right: number; aboveAuditor: boolean; auditorOpen: boolean } {
  const auditorOpen = useUIStore((s) => s.isAuditorOpen);
  const roomForBoth = useMediaQuery(SIDE_BY_SIDE_QUERY);
  if (!auditorOpen) return { right: 12, aboveAuditor: false, auditorOpen };
  return roomForBoth
    ? { right: 12 + AUDITOR_WIDTH + 12, aboveAuditor: false, auditorOpen }
    : { right: 12, aboveAuditor: true, auditorOpen };
}

export const FieldInspector: React.FC = () => {
  const col = useSchemaStore((s) => s.collections.find((c) => c.id === s.selectedCollectionId));
  const selectedFieldId = useSchemaStore((s) => s.selectedFieldId);
  const collapsed = useUIStore((s) => s.isInspectorCollapsed);
  const setCollapsed = useUIStore((s) => s.setInspectorCollapsed);
  const field = col?.fields.find((f) => f.id === selectedFieldId);
  const { right, aboveAuditor, auditorOpen } = useInspectorRight();
  // With the auditor open, both right-hand panels stop above the bottom dock so the three never collide.
  const bottom = auditorOpen ? 'bottom-[76px]' : 'bottom-[76px] lg:bottom-3';
  // Narrow screens: drawn above the auditor (z-40); collapsing it reveals the auditor again.
  const layer = aboveAuditor ? 'z-40' : 'z-30';

  return (
    <>
      <AnimatePresence>
        {col && !collapsed && (
          <motion.aside
            key="inspector"
            initial={{ x: 28, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 28, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 460, damping: 38, mass: 0.8 }}
            style={{ width: INSPECTOR_WIDTH, right }}
            className={`panel fixed top-[64px] ${bottom} ${layer} flex max-w-[calc(100vw-24px)] flex-col overflow-hidden transition-[right] duration-300`}
            aria-label="Inspector"
          >
            <InspectorHeader col={col} field={field} onCollapse={() => setCollapsed(true)} />
            <div className="min-h-0 flex-1 overflow-y-auto">
              {field ? <FieldPanel col={col} field={field} /> : <CollectionPanel col={col} />}
            </div>
          </motion.aside>
        )}
      </AnimatePresence>

      {col && collapsed && (
        <button
          type="button"
          onClick={() => setCollapsed(false)}
          style={{ right }}
          className={`panel fixed top-[64px] ${layer} flex h-9 items-center gap-2 px-3 text-[12.5px] font-medium text-fg-secondary transition hover:text-fg`}
          title="Open inspector"
        >
          <PanelRightOpen className="h-4 w-4" />
          Inspector
        </button>
      )}
    </>
  );
};

// ---------------------------------------------------------------------------

function InspectorHeader({ col, field, onCollapse }: { col: CollectionNode; field?: SchemaField; onCollapse: () => void }) {
  const Icon = iconFor(col.icon);
  const accent = accentFor(col.colorTag);
  return (
    <div className="flex h-12 shrink-0 items-center gap-2 border-b border-line bg-surface-subtle px-3">
      <div className="flex min-w-0 flex-1 items-center gap-1.5 text-[12.5px]">
        <span className="h-3 w-[3px] shrink-0 rounded-full" style={{ background: accent }} aria-hidden />
        <Icon className="h-3.5 w-3.5 shrink-0 text-fg-secondary" />
        <button
          type="button"
          onClick={() => actions().setSelectedField(null, col.id)}
          className={`truncate rounded px-1 transition hover:bg-surface-hover ${field ? 'text-fg-secondary' : 'font-semibold text-fg'}`}
        >
          {col.name}
        </button>
        {field && (
          <>
            <ChevronRight className="h-3 w-3 shrink-0 text-fg-secondary" />
            <span className="truncate font-mono text-[12px] font-medium text-fg">{field.name}</span>
          </>
        )}
      </div>
      <button
        type="button"
        className="btn btn-ghost btn-icon !h-7 !w-7"
        title={`Open ${col.name} API routes`}
        aria-label={`Open ${col.name} API routes`}
        onClick={() => openApiBuilder(col.id)}
      >
        <Route className="h-4 w-4" />
      </button>
      <button type="button" className="btn btn-ghost btn-icon !h-7 !w-7" title="Collapse inspector" onClick={onCollapse}>
        <PanelRightClose className="h-4 w-4" />
      </button>
      <button
        type="button"
        className="btn btn-ghost btn-icon !h-7 !w-7"
        title="Close (Esc)"
        onClick={() => actions().setSelectedCollection(null)}
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

function Section({ title, children, aside }: { title: string; children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <section className="border-b border-line px-4 py-4 last:border-b-0">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="section-title">{title}</h3>
        {aside}
      </div>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

function Toggle({
  label,
  hint,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <label className={`flex items-center justify-between gap-3 ${disabled ? 'opacity-40' : 'cursor-pointer'}`}>
      <span className="min-w-0">
        <span className="block text-[12.5px] text-fg">{label}</span>
        {hint && <span className="block text-[11px] text-fg-secondary">{hint}</span>}
      </span>
      <input
        type="checkbox"
        className="peer sr-only"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className="switch" />
    </label>
  );
}

function Select<T extends string>({
  value,
  options,
  onChange,
  mono,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  mono?: boolean;
}) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as T)}
        className={`field-input cursor-pointer appearance-none pr-8 ${mono ? 'font-mono text-[12px]' : ''}`}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value} className="bg-surface">
            {o.label}
          </option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute top-1/2 right-2.5 h-3.5 w-3.5 -translate-y-1/2 text-fg-secondary" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Collection panel
// ---------------------------------------------------------------------------

/** Route summary for the collection with a jump into the API builder. */
function ApiRoutesSection({ col }: { col: CollectionNode }) {
  const allEndpoints = useSchemaStore((s) => s.endpoints);
  const routes = allEndpoints.filter((e) => e.collectionId === col.id);
  return (
    <Section
      title="API routes"
      aside={
        routes.length > 0 && (
          <button type="button" className="btn btn-ghost !h-6 !px-1.5 !text-[11px]" onClick={() => openApiBuilder(col.id)}>
            Open <ArrowRight className="h-3 w-3" />
          </button>
        )
      }
    >
      {routes.length === 0 ? (
        <button
          type="button"
          className="btn btn-secondary w-full"
          onClick={() => {
            actions().generateDefaultEndpointsForCollection(col.id);
            openApiBuilder(col.id);
          }}
        >
          <WandSparkles className="h-3.5 w-3.5" /> Generate CRUD API
        </button>
      ) : (
        <ul className="-mx-1 space-y-0.5">
          {routes.slice(0, 6).map((ep) => (
            <li key={ep.id}>
              <button
                type="button"
                onClick={() => {
                  actions().setSelectedEndpoint(ep.id);
                  openApiBuilder(col.id);
                }}
                className="flex w-full items-center gap-2 rounded-control px-2 py-1.5 text-left transition hover:bg-surface-hover"
                title={ep.summary}
              >
                <MethodBadge method={ep.method} />
                <span className="min-w-0 flex-1 truncate font-mono text-[11.5px] text-fg">
                  {ep.path.startsWith(collectionBasePath(col.name)) ? ep.path.slice(collectionBasePath(col.name).length) || '/' : ep.path}
                </span>
              </button>
            </li>
          ))}
          {routes.length > 6 && (
            <li className="px-2 py-1 text-[11.5px] text-fg-secondary">+{routes.length - 6} more</li>
          )}
        </ul>
      )}
    </Section>
  );
}

function CollectionPanel({ col }: { col: CollectionNode }) {
  const [name, setName] = useState(col.name);
  useEffect(() => setName(col.name), [col.id, col.name]);
  const relationCount = useSchemaStore((s) =>
    countRelationships(s.collections.filter((c) => c.id === col.id)) +
    s.collections.reduce(
      (n, c) => n + (c.id === col.id ? 0 : c.fields.filter((f) => f.foreignKeyRef?.targetCollectionId === col.id).length),
      0,
    ),
  );
  const accent = accentFor(col.colorTag);
  const commitName = () => {
    actions().updateCollection(col.id, { name });
    setName(useSchemaStore.getState().collections.find((c) => c.id === col.id)?.name ?? name);
  };

  return (
    <>
      <Section title="Collection">
        <div>
          <label className="panel-label" htmlFor="sf-col-name">Name</label>
          <input
            id="sf-col-name"
            className="field-input font-medium"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={commitName}
            onKeyDown={(e) => e.key === 'Enter' && (e.currentTarget as HTMLInputElement).blur()}
          />
        </div>
        <div className="grid grid-cols-2 gap-2 text-[11.5px]">
          <div className="rounded-card border border-line bg-surface-subtle px-3 py-2">
            <div className="text-fg-secondary">Fields</div>
            <div className="font-mono text-[15px] text-fg">{col.fields.length}</div>
          </div>
          <div className="rounded-card border border-line bg-surface-subtle px-3 py-2">
            <div className="text-fg-secondary">Relations</div>
            <div className="font-mono text-[15px] text-fg">{relationCount}</div>
          </div>
        </div>
      </Section>

      <Section title="Appearance">
        <div>
          <span className="panel-label">Accent</span>
          <div className="flex flex-wrap gap-2">
            {ACCENT_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                aria-label={`Accent ${c}`}
                onClick={() => actions().updateCollection(col.id, { colorTag: c })}
                aria-pressed={accent === c}
                className="h-6 w-6 rounded-full border border-line transition hover:scale-110"
                style={{ background: c, outline: accent === c ? '1.5px solid var(--text-primary)' : undefined, outlineOffset: 2 }}
              />
            ))}
          </div>
        </div>
        <div>
          <span className="panel-label">Icon</span>
          <div className="grid grid-cols-6 gap-1.5">
            {Object.entries(COLLECTION_ICONS).map(([key, Icon]) => {
              const active = iconFor(col.icon) === Icon;
              return (
                <button
                  key={key}
                  type="button"
                  title={key}
                  onClick={() => actions().updateCollection(col.id, { icon: key })}
                  aria-pressed={active}
                  className={`flex h-9 items-center justify-center rounded-control border transition ${
                    active ? 'border-accent bg-accent-soft text-accent' : 'border-line bg-surface text-fg-secondary hover:bg-surface-hover hover:text-fg'
                  }`}
                >
                  <Icon className="h-4 w-4" />
                </button>
              );
            })}
          </div>
        </div>
      </Section>

      <Section
        title="Fields"
        aside={
          <button type="button" className="btn btn-ghost !h-6 !px-1.5 !text-[11px]" onClick={() => actions().addField(col.id)}>
            <Plus className="h-3.5 w-3.5" /> Add
          </button>
        }
      >
        <ul className="-mx-1 space-y-0.5">
          {col.fields.map((f) => (
            <li key={f.id}>
              <button
                type="button"
                onClick={() => actions().setSelectedField(f.id, col.id)}
                className="flex w-full items-center gap-2 rounded-control px-2 py-1.5 text-left transition hover:bg-surface-hover"
              >
                <span className="min-w-0 flex-1 truncate text-[12.5px] text-fg">{f.name}</span>
                <span className="font-mono text-[11px] text-fg-secondary">{f.type}</span>
                <ChevronRight className="h-3 w-3 text-fg-secondary" />
              </button>
            </li>
          ))}
          {col.fields.length === 0 && <li className="px-2 py-1.5 text-[12px] text-fg-secondary">No fields yet.</li>}
        </ul>
      </Section>

      <ApiRoutesSection col={col} />

      <Section title="Actions">
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => actions().duplicateCollection(col.id)}
            className="btn btn-secondary"
          >
            <Copy className="h-3.5 w-3.5" /> Duplicate
          </button>
          <button
            type="button"
            onClick={() => actions().deleteCollection(col.id)}
            className="btn btn-danger"
          >
            <Trash2 className="h-3.5 w-3.5" /> Delete
          </button>
        </div>
      </Section>
    </>
  );
}

// ---------------------------------------------------------------------------
// Field panel
// ---------------------------------------------------------------------------

function FieldPanel({ col, field }: { col: CollectionNode; field: SchemaField }) {
  const collections = useSchemaStore((s) => s.collections);
  const update = (patch: Partial<SchemaField>) => actions().updateField(col.id, field.id, patch);
  const updateValidation = (patch: Partial<SchemaField['validation']>) =>
    update({ validation: { ...field.validation, ...patch } });

  const ref = field.foreignKeyRef;
  const targetCol = collections.find((c) => c.id === ref?.targetCollectionId);
  const relType: RelationshipType = ref?.relationType ?? 'one-to-many';
  const indexed = !!field.index?.indexed;

  return (
    <>
      <Section title="Field">
        <div>
          <label className="panel-label" htmlFor="sf-field-name">Name</label>
          <input
            id="sf-field-name"
            className="field-input font-mono text-[12.5px]"
            value={field.name}
            onChange={(e) => update({ name: e.target.value })}
          />
        </div>
        <div>
          <span className="panel-label">Type</span>
          <Select
            mono
            value={field.type}
            options={DATA_TYPES.map((t) => ({ value: t, label: t }))}
            onChange={(type) => update({ type })}
          />
        </div>
        {field.type === 'Array' && (
          <div>
            <span className="panel-label">Item type</span>
            <Select
              mono
              value={field.array?.itemType ?? 'String'}
              options={DATA_TYPES.filter((t) => t !== 'Array').map((t) => ({ value: t, label: t }))}
              onChange={(itemType) => update({ array: { ...field.array, itemType } })}
            />
          </div>
        )}
        {field.type === 'Enum' && (
          <div>
            <label className="panel-label" htmlFor="sf-enum">Allowed values</label>
            <input
              id="sf-enum"
              className="field-input font-mono text-[12px]"
              placeholder="draft, published, archived"
              value={(field.validation.enumOptions ?? []).join(', ')}
              onChange={(e) =>
                updateValidation({
                  enumOptions: e.target.value.split(',').map((s) => s.trim()).filter(Boolean),
                })
              }
            />
          </div>
        )}
      </Section>

      <Section title="Constraints">
        <Toggle label="Primary key" checked={!!field.isPrimaryKey} onChange={(v) => update({ isPrimaryKey: v })} />
        <Toggle label="Required" hint="Value must be present" checked={!!field.validation.required} onChange={(v) => updateValidation({ required: v })} />
        <Toggle label="Unique" hint="Enforced with a unique index" checked={!!field.validation.unique} onChange={(v) => updateValidation({ unique: v })} />
        <Toggle
          label="Indexed"
          hint="Secondary index for faster lookups"
          checked={indexed}
          onChange={(v) => update({ index: v ? { ...field.index, indexed: true } : undefined })}
        />
        {indexed && field.type === 'Date' && (
          <div>
            <label className="panel-label" htmlFor="sf-ttl">TTL (seconds)</label>
            <input
              id="sf-ttl"
              type="number"
              min={0}
              className="field-input font-mono text-[12px]"
              placeholder="e.g. 86400"
              value={field.index?.ttlSeconds ?? ''}
              onChange={(e) =>
                update({
                  index: {
                    ...field.index,
                    indexed: true,
                    ttlSeconds: e.target.value === '' ? undefined : Math.max(0, Number(e.target.value)),
                  },
                })
              }
            />
          </div>
        )}
      </Section>

      <Section title="Validation">
        <div>
          <label className="panel-label" htmlFor="sf-default">Default value</label>
          <input
            id="sf-default"
            className="field-input font-mono text-[12px]"
            placeholder="Date.now, 0, 'pending'"
            value={field.validation.defaultVal ?? ''}
            onChange={(e) => updateValidation({ defaultVal: e.target.value })}
          />
        </div>
        {(field.type === 'String' || field.type === 'UUID') && (
          <div>
            <label className="panel-label" htmlFor="sf-match">Match pattern</label>
            <input
              id="sf-match"
              className="field-input font-mono text-[12px]"
              placeholder="/^\S+@\S+\.\S+$/"
              value={field.validation.match ?? ''}
              onChange={(e) => updateValidation({ match: e.target.value })}
            />
          </div>
        )}
      </Section>

      <Section title="Reference">
        <Toggle
          label="Foreign key"
          hint={ref && targetCol ? `→ ${targetCol.name}` : 'Reference another collection'}
          checked={!!field.isForeignKey}
          onChange={(checked) => {
            if (!checked) {
              actions().deleteRelationship(relationshipIdForField(field.id));
              return;
            }
            const target = collections.find((c) => c.id !== col.id) ?? collections[0];
            if (!target) return;
            actions().addRelationship({
              sourceCollectionId: col.id,
              sourceFieldId: field.id,
              targetCollectionId: target.id,
              targetFieldId: target.fields.find((f) => f.isPrimaryKey)?.id ?? target.fields[0]?.id ?? '',
            });
          }}
        />
        {field.isForeignKey && ref && (
          <div className="space-y-3 rounded-card border border-line bg-surface-subtle p-3">
            <div>
              <span className="panel-label">Target collection</span>
              <Select
                value={ref.targetCollectionId}
                options={collections.map((c) => ({ value: c.id, label: c.name }))}
                onChange={(targetCollectionId) => {
                  const t = collections.find((c) => c.id === targetCollectionId);
                  actions().updateRelationship(relationshipIdForField(field.id), {
                    targetCollectionId,
                    targetFieldId: t?.fields.find((f) => f.isPrimaryKey)?.id ?? t?.fields[0]?.id ?? '',
                  });
                }}
              />
            </div>
            <div>
              <span className="panel-label">Target field</span>
              <Select
                mono
                value={ref.targetFieldId}
                options={(targetCol?.fields ?? []).map((f) => ({ value: f.id, label: `${f.name} (${f.type})` }))}
                onChange={(targetFieldId) => actions().updateRelationship(relationshipIdForField(field.id), { targetFieldId })}
              />
            </div>
            <div>
              <span className="panel-label">Cardinality</span>
              <div className="segmented">
                {(['one-to-one', 'one-to-many', 'many-to-many'] as RelationshipType[]).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => actions().updateRelationship(relationshipIdForField(field.id), { type: t })}
                    aria-pressed={relType === t}
                    className="font-mono"
                  >
                    {RELATIONSHIP_LABELS[t]}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </Section>

      <div className="px-4 py-4">
        <button
          type="button"
          onClick={() => actions().deleteField(col.id, field.id)}
          className="btn btn-danger w-full"
        >
          <Trash2 className="h-3.5 w-3.5" /> Delete field
        </button>
      </div>
    </>
  );
}
