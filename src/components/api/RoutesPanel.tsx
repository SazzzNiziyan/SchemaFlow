import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, ChevronDown, Globe, Plus, Trash2, WandSparkles } from 'lucide-react';
import type { ApiEndpoint, CollectionNode } from '../../types';
import { useSchemaStore } from '../../store/useSchemaStore';
import { useUIStore } from '../../store/useUIStore';
import { requestPathFocus, selectApiCollection } from '../../hooks/useApiBuilder';
import {
  collectionBasePath,
  lintMiddlewareChain,
  orderedSteps,
  PAGINATION_QUERY_KEYS,
} from '../../utils/apiCodeGenerator';
import { createId } from '../../utils/schemaOps';
import { accentFor } from '../nodeVisuals';
import { MOD_KEY } from '../TopBar';
import { MethodBadge, MIDDLEWARE_ICONS, stepShortLabel } from './apiUi';

const store = () => useSchemaStore.getState();

export function RoutesPanel({
  collection,
  endpoints,
  endpoint,
  className = '',
}: {
  collection: CollectionNode;
  endpoints: ApiEndpoint[];
  endpoint: ApiEndpoint | undefined;
  className?: string;
}) {
  const query = useUIStore((s) => s.searchQuery).trim().toLowerCase();
  const basePath = collectionBasePath(collection.name);
  const listRef = useRef<HTMLUListElement>(null);

  const visible = useMemo(
    () =>
      query
        ? endpoints.filter((e) =>
            `${e.method} ${e.path} ${e.summary} ${e.middlewares.map((m) => m.kind).join(' ')}`.toLowerCase().includes(query),
          )
        : endpoints,
    [endpoints, query],
  );

  const addRoute = () => {
    const taken = new Set(endpoints.map((e) => e.path));
    let path = `${basePath}/custom`;
    for (let n = 2; taken.has(path); n++) path = `${basePath}/custom-${n}`;
    const id = store().addEndpoint({
      collectionId: collection.id,
      method: 'GET',
      path,
      summary: 'New route',
      tags: [collection.name],
      queryFields: [...PAGINATION_QUERY_KEYS],
      middlewares: [
        { id: createId('mw'), kind: 'rateLimit', enabled: true, order: 0, config: { rpm: 60 } },
        { id: createId('mw'), kind: 'auth', enabled: true, order: 1 },
      ],
    });
    requestPathFocus(id);
  };

  const removeRoute = (ep: ApiEndpoint) => {
    store().deleteEndpoint(ep.id);
    useUIStore.getState().showToast({
      title: 'Route deleted',
      description: `${ep.method} ${ep.path} removed. Press ${MOD_KEY}+Z to undo.`,
      type: 'info',
    });
  };

  // ↑ / ↓ move the selection while focus is inside the list.
  const onListKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    if (!visible.length) return;
    e.preventDefault();
    const idx = visible.findIndex((v) => v.id === endpoint?.id);
    const next = visible[Math.max(0, Math.min(visible.length - 1, idx + (e.key === 'ArrowDown' ? 1 : -1)))];
    store().setSelectedEndpoint(next.id);
    requestAnimationFrame(() =>
      listRef.current?.querySelector<HTMLElement>(`[data-endpoint-id="${next.id}"] button`)?.focus(),
    );
  };

  return (
    <aside className={`panel flex min-h-[360px] flex-col overflow-hidden ${className}`} aria-label="Routes">
      {/* Collection + actions */}
      <div className="shrink-0 space-y-2.5 border-b border-line bg-surface-subtle p-3">
        <CollectionSelect collection={collection} />
        <div className="grid grid-cols-[1fr_auto] gap-2">
          <GenerateCrudButton collection={collection} existing={endpoints.length} />
          <button type="button" className="btn btn-primary" onClick={addRoute} title="Add a custom route">
            <Plus className="h-4 w-4" />
            Route
          </button>
        </div>
      </div>

      <div className="flex h-9 shrink-0 items-center justify-between px-3">
        <h2 className="section-title">
          Routes <span className="tabular ml-1 font-mono text-fg">{endpoints.length}</span>
        </h2>
        <span className="truncate pl-2 font-mono text-[11px] text-fg-secondary" title="Router mount path">
          {basePath}
        </span>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
        {endpoints.length === 0 ? (
          <EmptyRoutes collection={collection} onAdd={addRoute} />
        ) : visible.length === 0 ? (
          <p className="px-2 py-6 text-center text-[12px] text-fg-secondary">No routes match “{query}”.</p>
        ) : (
          <ul ref={listRef} className="space-y-1" onKeyDown={onListKeyDown} aria-label={`${collection.name} routes`}>
            {visible.map((ep) => (
              <RouteRow
                key={ep.id}
                ep={ep}
                collection={collection}
                basePath={basePath}
                selected={ep.id === endpoint?.id}
                onDelete={() => removeRoute(ep)}
              />
            ))}
          </ul>
        )}
      </div>
    </aside>
  );
}

// ---------------------------------------------------------------------------

function CollectionSelect({ collection }: { collection: CollectionNode }) {
  const collections = useSchemaStore((s) => s.collections);
  const allEndpoints = useSchemaStore((s) => s.endpoints);
  const routeCounts = useMemo(() => {
    const m: Record<string, number> = {};
    allEndpoints.forEach((e) => (m[e.collectionId] = (m[e.collectionId] ?? 0) + 1));
    return m;
  }, [allEndpoints]);

  return (
    <div>
      <label className="panel-label" htmlFor="sf-api-collection">
        Collection
      </label>
      <div className="relative">
        <span
          className="pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-[3px] -translate-y-1/2 rounded-full"
          style={{ background: accentFor(collection.colorTag) }}
          aria-hidden
        />
        <select
          id="sf-api-collection"
          value={collection.id}
          onChange={(e) => selectApiCollection(e.target.value)}
          className="field-input cursor-pointer appearance-none !pl-6 pr-8 font-medium"
        >
          {collections.map((c) => (
            <option key={c.id} value={c.id} className="bg-surface">
              {c.name}
              {routeCounts[c.id] ? ` · ${routeCounts[c.id]} routes` : ''}
            </option>
          ))}
        </select>
        <ChevronDown className="pointer-events-none absolute top-1/2 right-2.5 h-3.5 w-3.5 -translate-y-1/2 text-fg-secondary" />
      </div>
    </div>
  );
}

/**
 * Generates the 5 CRUD routes. When routes already exist it arms first and
 * asks inline ("Replace 5 routes?") — no modal; the action is also undoable.
 */
function GenerateCrudButton({ collection, existing }: { collection: CollectionNode; existing: number }) {
  const [armed, setArmed] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  useEffect(() => setArmed(false), [collection.id]);

  const run = () => {
    if (existing > 0 && !armed) {
      setArmed(true);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setArmed(false), 4000);
      return;
    }
    clearTimeout(timer.current);
    setArmed(false);
    store().generateDefaultEndpointsForCollection(collection.id);
    useUIStore.getState().showToast({
      title: existing ? 'CRUD routes regenerated' : 'CRUD routes generated',
      description: `5 routes for ${collection.name}${existing ? ` replaced ${existing}` : ''}. ${MOD_KEY}+Z to undo.`,
      type: 'success',
    });
  };

  return (
    <button
      type="button"
      onClick={run}
      onBlur={() => setArmed(false)}
      className={`btn ${armed ? 'btn-danger' : 'btn-secondary'}`}
      title={existing ? 'Replace this collection’s routes with the default CRUD set' : 'Generate list, get, create, update and delete routes'}
    >
      <WandSparkles className="h-4 w-4" />
      {armed ? `Replace ${existing} route${existing === 1 ? '' : 's'}?` : existing ? 'Regenerate CRUD' : 'Generate CRUD'}
    </button>
  );
}

const RouteRow: React.FC<{
  ep: ApiEndpoint;
  collection: CollectionNode;
  basePath: string;
  selected: boolean;
  onDelete: () => void;
}> = ({
  ep,
  collection,
  basePath,
  selected,
  onDelete,
}) => {
  const steps = orderedSteps(ep.middlewares).filter((s) => s.enabled);
  const warnings = lintMiddlewareChain(ep, collection).filter((i) => i.severity === 'warning');
  const isPublic = !steps.some((s) => s.kind === 'auth');
  const tail = ep.path.startsWith(basePath) ? ep.path.slice(basePath.length) : null;

  return (
    <li data-endpoint-id={ep.id} className="group relative">
      <button
        type="button"
        onClick={() => store().setSelectedEndpoint(ep.id)}
        aria-current={selected ? 'true' : undefined}
        className={`w-full rounded-card border px-2.5 py-2 pr-9 text-left transition ${
          selected
            ? 'selection-ring bg-accent-soft'
            : 'border-transparent hover:border-line hover:bg-surface-hover'
        }`}
      >
        <div className="flex items-center gap-2">
          <MethodBadge method={ep.method} />
          <span className="min-w-0 flex-1 truncate font-mono text-[12px]" title={ep.path}>
            {tail !== null ? (
              <>
                <span className="text-fg-secondary">{basePath}</span>
                <span className="font-medium text-fg">{tail}</span>
              </>
            ) : (
              <span className="font-medium text-fg">{ep.path}</span>
            )}
          </span>
          {warnings.length > 0 && (
            <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-warning" aria-label={`${warnings.length} pipeline warnings`} />
          )}
        </div>
        {ep.summary && <div className="mt-1 truncate pl-[60px] text-[11.5px] text-fg-secondary">{ep.summary}</div>}
        <div className="mt-1.5 flex flex-wrap items-center gap-1 pl-[60px]">
          {isPublic && (
            <span className="inline-flex h-[18px] items-center gap-1 rounded-[4px] border border-line px-1.5 font-mono text-[10px] text-fg-secondary">
              <Globe className="h-2.5 w-2.5" /> public
            </span>
          )}
          {steps.map((s) => {
            const Icon = MIDDLEWARE_ICONS[s.kind];
            return (
              <span
                key={s.id}
                className="inline-flex h-[18px] items-center gap-1 rounded-[4px] border border-line bg-surface px-1.5 font-mono text-[10px] text-fg-secondary"
              >
                <Icon className="h-2.5 w-2.5" />
                {stepShortLabel(s)}
              </span>
            );
          })}
          {steps.length === 0 && <span className="font-mono text-[10px] text-fg-secondary">no middleware</span>}
        </div>
      </button>
      <button
        type="button"
        onClick={onDelete}
        className={`btn btn-ghost btn-icon absolute top-1.5 right-1.5 !h-7 !w-7 hover:!bg-danger-soft hover:!text-danger focus-visible:opacity-100 group-hover:opacity-100 ${
          selected ? 'opacity-100' : 'opacity-0'
        }`}
        title={`Delete ${ep.method} ${ep.path}`}
        aria-label={`Delete ${ep.method} ${ep.path}`}
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </li>
  );
};

function EmptyRoutes({ collection, onAdd }: { collection: CollectionNode; onAdd: () => void }) {
  return (
    <div className="mx-1 mt-1 rounded-card border border-dashed border-line-strong px-4 py-6 text-center">
      <div className="text-[13px] font-semibold text-fg">No routes for {collection.name}</div>
      <p className="mx-auto mt-1 max-w-[220px] text-[12px] leading-relaxed text-fg-secondary">
        Start from a REST CRUD set with sensible auth, validation and RBAC, or add a single custom route.
      </p>
      <div className="mt-4 flex flex-col items-center gap-2">
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => store().generateDefaultEndpointsForCollection(collection.id)}
        >
          <WandSparkles className="h-4 w-4" /> Generate default CRUD
        </button>
        <button type="button" className="btn btn-ghost !h-7 !text-[12px]" onClick={onAdd}>
          <Plus className="h-3.5 w-3.5" /> Add a custom route
        </button>
      </div>
    </div>
  );
}
