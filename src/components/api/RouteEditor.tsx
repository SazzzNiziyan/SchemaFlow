import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowDown,
  ArrowDownWideNarrow,
  ArrowRight,
  ArrowUp,
  ChevronDown,
  CopyPlus,
  GripVertical,
  Info,
  Plus,
  Route as RouteIcon,
  Trash2,
  X,
} from 'lucide-react';
import type { ApiEndpoint, CollectionNode, HttpMethod, MiddlewareKind, MiddlewareStep } from '../../types';
import { useSchemaStore } from '../../store/useSchemaStore';
import { useUIStore } from '../../store/useUIStore';
import { consumePathFocus } from '../../hooks/useApiBuilder';
import {
  bodyEligibleFields,
  collectionBasePath,
  defaultMiddlewareConfig,
  lintMiddlewareChain,
  MIDDLEWARE_META,
  methodHasBody,
  normalizeRoutePath,
  orderedSteps,
  PAGINATION_QUERY_KEYS,
  RECOMMENDED_MIDDLEWARE_ORDER,
  routeValidatorExpr,
  sortByRecommendedOrder,
  type ChainIssue,
} from '../../utils/apiCodeGenerator';
import { createId } from '../../utils/schemaOps';
import { modelNameFor } from '../../utils/naming';
import { MOD_KEY } from '../TopBar';
import { FieldChip, HTTP_METHODS, METHOD_TONE, MethodBadge, MIDDLEWARE_ICONS, PanelSection } from './apiUi';

const store = () => useSchemaStore.getState();

export function RouteEditor({
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
  if (!endpoint) {
    return (
      <section className={`panel flex min-h-[360px] flex-col items-center justify-center p-8 text-center ${className}`}>
        <RouteIcon className="h-6 w-6 text-fg-muted" />
        <div className="mt-3 text-[13px] font-semibold text-fg">No route selected</div>
        <p className="mt-1 max-w-[280px] text-[12px] leading-relaxed text-fg-secondary">
          Generate the default CRUD set for <span className="font-medium text-fg">{collection.name}</span> or add a
          route, then configure its method, path, fields and middleware pipeline here.
        </p>
      </section>
    );
  }

  return (
    <section className={`panel flex min-h-[360px] flex-col overflow-hidden ${className}`} aria-label="Route editor">
      <EditorHeader endpoint={endpoint} collection={collection} />
      <div className="min-h-0 flex-1 overflow-y-auto">
        <RequestSection key={endpoint.id} endpoint={endpoint} collection={collection} endpoints={endpoints} />
        <FieldsSection endpoint={endpoint} collection={collection} />
        <PipelineSection endpoint={endpoint} collection={collection} />
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Header
// ---------------------------------------------------------------------------

function EditorHeader({ endpoint, collection }: { endpoint: ApiEndpoint; collection: CollectionNode }) {
  const duplicate = () => {
    const taken = new Set(store().endpoints.filter((e) => e.collectionId === collection.id).map((e) => e.path));
    let path = `${endpoint.path}-copy`;
    for (let n = 2; taken.has(path); n++) path = `${endpoint.path}-copy-${n}`;
    const { id: _id, ...rest } = endpoint;
    store().addEndpoint({
      ...rest,
      path,
      summary: endpoint.summary ? `${endpoint.summary} (copy)` : '',
      middlewares: endpoint.middlewares.map((m) => ({ ...m, id: createId('mw') })),
    });
  };
  const remove = () => {
    store().deleteEndpoint(endpoint.id);
    useUIStore.getState().showToast({
      title: 'Route deleted',
      description: `${endpoint.method} ${endpoint.path} removed. Press ${MOD_KEY}+Z to undo.`,
      type: 'info',
    });
  };

  return (
    <div className="flex h-12 shrink-0 items-center gap-2 border-b border-line bg-surface-subtle px-3">
      <MethodBadge method={endpoint.method} />
      <span className="min-w-0 flex-1 truncate font-mono text-[12.5px] font-medium text-fg" title={endpoint.path}>
        {endpoint.path}
      </span>
      <button type="button" className="btn btn-ghost btn-icon !h-7 !w-7" onClick={duplicate} title="Duplicate route" aria-label="Duplicate route">
        <CopyPlus className="h-4 w-4" />
      </button>
      <button
        type="button"
        className="btn btn-ghost btn-icon !h-7 !w-7 hover:!bg-danger-soft hover:!text-danger"
        onClick={remove}
        title="Delete route"
        aria-label="Delete route"
      >
        <Trash2 className="h-4 w-4" />
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Request: method, path, summary
// ---------------------------------------------------------------------------

const RequestSection: React.FC<{
  endpoint: ApiEndpoint;
  collection: CollectionNode;
  endpoints: ApiEndpoint[];
}> = ({
  endpoint,
  collection,
  endpoints,
}) => {
  const pathRef = useRef<HTMLInputElement>(null);
  const basePath = collectionBasePath(collection.name);

  // A route created from the list lands here with its path selected for typing.
  useEffect(() => {
    if (consumePathFocus(endpoint.id)) {
      pathRef.current?.focus();
      const v = pathRef.current?.value ?? '';
      const tail = v.startsWith(basePath) ? basePath.length + 1 : 0;
      pathRef.current?.setSelectionRange(tail, v.length);
    }
  }, [endpoint.id, basePath]);

  const setMethod = (method: HttpMethod) => {
    if (method === endpoint.method) return;
    const patch: Partial<ApiEndpoint> = { method };
    // Seed sensible field selections the first time a route gains a body / query.
    if (methodHasBody(method) && !endpoint.bodyFields) patch.bodyFields = bodyEligibleFields(collection).map((f) => f.name);
    if (method === 'GET' && !endpoint.queryFields) patch.queryFields = [...PAGINATION_QUERY_KEYS];
    store().updateEndpoint(endpoint.id, patch);
  };

  const duplicate = endpoints.find((e) => e.id !== endpoint.id && e.method === endpoint.method && e.path === endpoint.path);
  const params = [...endpoint.path.matchAll(/:(\w+)/g)].map((m) => m[1]);
  const outsideBase = endpoint.path !== basePath && !endpoint.path.startsWith(`${basePath}/`);

  return (
    <PanelSection title="Request">
      <div className="space-y-3">
        <div>
          <span className="panel-label">Method</span>
          <div className="segmented" role="group" aria-label="HTTP method">
            {HTTP_METHODS.map((m) => (
              <button
                key={m}
                type="button"
                aria-pressed={endpoint.method === m}
                onClick={() => setMethod(m)}
                className={`!font-mono !text-[11px] !font-semibold ${endpoint.method === m ? METHOD_TONE[m].split(' ')[0] : ''}`}
              >
                {m}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="panel-label" htmlFor="sf-route-path">
            Path
          </label>
          <input
            id="sf-route-path"
            ref={pathRef}
            value={endpoint.path}
            spellCheck={false}
            autoComplete="off"
            onChange={(e) => store().updateEndpoint(endpoint.id, { path: e.target.value.replace(/[\s'"`\\]+/g, '') })}
            onBlur={(e) => {
              const p = normalizeRoutePath(e.target.value);
              if (p !== endpoint.path) store().updateEndpoint(endpoint.id, { path: p });
            }}
            onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
            className="field-input font-mono text-[12.5px]"
            placeholder={`${basePath}/:id`}
          />
          <div className="mt-1.5 space-y-1 text-[11.5px]">
            {params.length > 0 && (
              <div className="flex flex-wrap items-center gap-1 text-fg-secondary">
                Params
                {params.map((p) => (
                  <span key={p} className="badge badge-fk normal-case">
                    :{p}
                  </span>
                ))}
              </div>
            )}
            {duplicate && (
              <Note tone="warning">
                Another route already handles {endpoint.method} {endpoint.path} — Express will only ever run the first one.
              </Note>
            )}
            {outsideBase && (
              <Note tone="info">
                Outside <span className="font-mono">{basePath}</span>: registered verbatim on the {collection.name} router.
              </Note>
            )}
          </div>
        </div>

        <div>
          <label className="panel-label" htmlFor="sf-route-summary">
            Summary
          </label>
          <input
            id="sf-route-summary"
            value={endpoint.summary}
            onChange={(e) => store().updateEndpoint(endpoint.id, { summary: e.target.value })}
            onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
            className="field-input"
            placeholder="What this route does"
          />
        </div>
      </div>
    </PanelSection>
  );
};

// ---------------------------------------------------------------------------
// Query / body fields
// ---------------------------------------------------------------------------

function FieldsSection({ endpoint, collection }: { endpoint: ApiEndpoint; collection: CollectionNode }) {
  const isList = endpoint.method === 'GET' && !endpoint.path.includes(':');
  const hasBody = methodHasBody(endpoint.method);
  if (!isList && !hasBody) return null;

  if (isList) {
    const selected = new Set(endpoint.queryFields ?? []);
    const toggle = (name: string) => {
      const next = new Set(selected);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      // Keep pagination first, then schema field order.
      const order = [...PAGINATION_QUERY_KEYS, ...collection.fields.map((f) => f.name)];
      store().updateEndpoint(endpoint.id, { queryFields: order.filter((n) => next.has(n)) });
    };
    const filterable = collection.fields.filter((f) => f.type !== 'JSON' && !f.nested);
    return (
      <PanelSection title="Query parameters" hint="Pagination plus fields clients may filter by.">
        <div className="flex flex-wrap gap-1.5">
          {PAGINATION_QUERY_KEYS.map((k) => (
            <FieldChip key={k} label={k} meta="page" pressed={selected.has(k)} onToggle={() => toggle(k)} />
          ))}
          <span className="mx-0.5 w-px self-stretch bg-line" aria-hidden />
          {filterable.map((f) => (
            <FieldChip key={f.id} label={f.name} meta={f.type} pressed={selected.has(f.name)} onToggle={() => toggle(f.name)} />
          ))}
        </div>
      </PanelSection>
    );
  }

  const eligible = bodyEligibleFields(collection);
  const selected = new Set(endpoint.bodyFields ?? eligible.map((f) => f.name));
  const set = (names: string[]) => store().updateEndpoint(endpoint.id, { bodyFields: names });
  const toggle = (name: string) =>
    set(eligible.map((f) => f.name).filter((n) => (n === name ? !selected.has(n) : selected.has(n))));
  const validator = routeValidatorExpr(endpoint, collection);

  return (
    <PanelSection
      title="Body fields"
      hint="Writable fields accepted in the JSON body."
      aside={
        <div className="flex items-center gap-0.5">
          <button type="button" className="btn btn-ghost !h-6 !px-1.5 !text-[11px]" onClick={() => set(eligible.map((f) => f.name))}>
            All
          </button>
          <button type="button" className="btn btn-ghost !h-6 !px-1.5 !text-[11px]" onClick={() => set([])}>
            None
          </button>
        </div>
      }
    >
      {eligible.length === 0 ? (
        <p className="text-[12px] text-fg-secondary">{collection.name} has no writable fields yet.</p>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {eligible.map((f) => (
            <FieldChip
              key={f.id}
              label={f.name}
              meta={f.type}
              required={!!f.validation.required && endpoint.method === 'POST'}
              pressed={selected.has(f.name)}
              onToggle={() => toggle(f.name)}
            />
          ))}
        </div>
      )}
      {validator && (
        <div className="mt-3 flex items-start gap-1.5 text-[11.5px] text-fg-secondary">
          <span className="shrink-0">Validator</span>
          <code className="min-w-0 break-all rounded-[4px] bg-surface-subtle px-1.5 py-0.5 font-mono text-[11px] text-fg">{validator}</code>
        </div>
      )}
      {endpoint.method === 'POST' && eligible.some((f) => f.validation.required && !selected.has(f.name)) && (
        <Note tone="warning" className="mt-2">
          A required field is excluded, so creates will fail Mongoose validation unless the handler fills it in.
        </Note>
      )}
    </PanelSection>
  );
}

// ---------------------------------------------------------------------------
// Middleware pipeline
// ---------------------------------------------------------------------------

function PipelineSection({ endpoint, collection }: { endpoint: ApiEndpoint; collection: CollectionNode }) {
  const steps = orderedSteps(endpoint.middlewares);
  const issues = useMemo(() => lintMiddlewareChain(endpoint, collection), [endpoint, collection]);
  const routeIssues = issues.filter((i) => !i.stepId);
  const present = new Set(steps.map((s) => s.kind));
  const missing = RECOMMENDED_MIDDLEWARE_ORDER.filter((k) => !present.has(k));
  const isRecommended = sortByRecommendedOrder(steps).every((s, i) => s.id === steps[i]?.id);

  // Drag & drop: armed from the grip so inputs inside a row stay selectable.
  const [armedId, setArmedId] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropIndex, setDropIndex] = useState<number | null>(null);
  const listRef = useRef<HTMLOListElement>(null);

  /** Writes a new visible order back as `order` 0..n-1 (one undo step). */
  const commitOrder = (list: MiddlewareStep[]) =>
    store().updateEndpoint(endpoint.id, { middlewares: list.map((s, order) => ({ ...s, order })) });

  const move = (from: number, to: number) => {
    if (to < 0 || to >= steps.length || from === to) return;
    const list = [...steps];
    const [moved] = list.splice(from, 1);
    list.splice(to, 0, moved);
    commitOrder(list);
  };

  // New steps slot into their recommended position rather than the end.
  const addStep = (kind: MiddlewareKind) => {
    const rank = RECOMMENDED_MIDDLEWARE_ORDER.indexOf(kind);
    const at = steps.findIndex((s) => RECOMMENDED_MIDDLEWARE_ORDER.indexOf(s.kind) > rank);
    const step: MiddlewareStep = { id: createId('mw'), kind, enabled: true, order: 0, config: defaultMiddlewareConfig(kind, collection) };
    const list = [...steps];
    list.splice(at === -1 ? list.length : at, 0, step);
    commitOrder(list);
  };

  const sortRecommended = () => store().updateEndpoint(endpoint.id, { middlewares: sortByRecommendedOrder(endpoint.middlewares) });

  const onDragOver = (e: React.DragEvent, index: number) => {
    if (!dragId) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setDropIndex(e.clientY < r.top + r.height / 2 ? index : index + 1);
  };
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (dragId !== null && dropIndex !== null) {
      const from = steps.findIndex((s) => s.id === dragId);
      const to = dropIndex > from ? dropIndex - 1 : dropIndex;
      move(from, to);
    }
    endDrag();
  };
  const endDrag = () => {
    setDragId(null);
    setDropIndex(null);
    setArmedId(null);
  };

  return (
    <PanelSection
      title="Middleware pipeline"
      hint="Runs top to bottom before the handler. Drag, use the arrows, or Alt+↑/↓."
      aside={
        <button
          type="button"
          className="btn btn-ghost !h-7 !px-2 !text-[11.5px]"
          onClick={sortRecommended}
          disabled={isRecommended || steps.length < 2}
          title="rateLimit → auth → validateZod → rbac → ownership → auditLog → softDelete"
        >
          <ArrowDownWideNarrow className="h-3.5 w-3.5" />
          Recommended order
        </button>
      }
    >
      <FlowStrip steps={steps} />

      {routeIssues.length > 0 && (
        <div className="mt-3 space-y-1">
          {routeIssues.map((i, n) => (
            <Note key={n} tone={i.severity}>
              {i.message}
            </Note>
          ))}
        </div>
      )}

      {steps.length === 0 ? (
        <p className="mt-3 rounded-card border border-dashed border-line-strong px-3 py-4 text-center text-[12px] text-fg-secondary">
          No middleware — requests go straight to the handler.
        </p>
      ) : (
        <ol ref={listRef} className="mt-3 space-y-1.5" onDragLeave={(e) => !listRef.current?.contains(e.relatedTarget as Node) && setDropIndex(null)}>
          {steps.map((step, i) => (
            <li
              key={step.id}
              draggable={armedId === step.id}
              onDragStart={(e) => {
                setDragId(step.id);
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData('text/plain', step.id);
              }}
              onDragEnd={endDrag}
              onDragOver={(e) => onDragOver(e, i)}
              onDrop={onDrop}
              className="relative"
            >
              {dropIndex === i && dragId && <DropLine position="top" />}
              <StepRow
                step={step}
                index={i}
                count={steps.length}
                endpoint={endpoint}
                collection={collection}
                issues={issues.filter((x) => x.stepId === step.id)}
                dragging={dragId === step.id}
                onArm={() => setArmedId(step.id)}
                onDisarm={() => !dragId && setArmedId(null)}
                onMove={(dir) => move(i, i + dir)}
              />
              {dropIndex === steps.length && i === steps.length - 1 && dragId && <DropLine position="bottom" />}
            </li>
          ))}
        </ol>
      )}

      {missing.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          <span className="mr-0.5 text-[11.5px] text-fg-secondary">Add</span>
          {missing.map((k) => {
            const Icon = MIDDLEWARE_ICONS[k];
            return (
              <button
                key={k}
                type="button"
                onClick={() => addStep(k)}
                className="inline-flex h-7 items-center gap-1.5 rounded-control border border-dashed border-line-strong px-2 text-[11.5px] text-fg-secondary transition hover:border-accent hover:bg-accent-soft hover:text-fg"
                title={MIDDLEWARE_META[k].description}
              >
                <Plus className="h-3 w-3" />
                <Icon className="h-3.5 w-3.5" />
                {MIDDLEWARE_META[k].label}
              </button>
            );
          })}
        </div>
      )}
    </PanelSection>
  );
}

function DropLine({ position }: { position: 'top' | 'bottom' }) {
  return (
    <div
      className={`pointer-events-none absolute right-0 left-0 z-10 h-0.5 rounded-full bg-accent ${position === 'top' ? '-top-1' : '-bottom-1'}`}
      aria-hidden
    />
  );
}

/** Request → step → step → handler, as a compact read-only summary. */
function FlowStrip({ steps }: { steps: MiddlewareStep[] }) {
  const enabled = steps.filter((s) => s.enabled);
  const node = 'inline-flex h-6 items-center gap-1 rounded-control border px-2 font-mono text-[11px]';
  return (
    <div className="flex flex-wrap items-center gap-1" aria-label="Execution order">
      <span className={`${node} border-line bg-surface-subtle text-fg-secondary`}>request</span>
      {enabled.map((s) => {
        const Icon = MIDDLEWARE_ICONS[s.kind];
        return (
          <React.Fragment key={s.id}>
            <ArrowRight className="h-3 w-3 text-fg-muted" aria-hidden />
            <span className={`${node} border-line bg-surface text-fg`}>
              <Icon className="h-3 w-3 text-fg-secondary" />
              {s.kind}
            </span>
          </React.Fragment>
        );
      })}
      <ArrowRight className="h-3 w-3 text-fg-muted" aria-hidden />
      <span className={`${node} border-accent/40 bg-accent-soft text-fg`}>handler</span>
    </div>
  );
}

function StepRow({
  step,
  index,
  count,
  endpoint,
  collection,
  issues,
  dragging,
  onArm,
  onDisarm,
  onMove,
}: {
  step: MiddlewareStep;
  index: number;
  count: number;
  endpoint: ApiEndpoint;
  collection: CollectionNode;
  issues: ChainIssue[];
  dragging: boolean;
  onArm: () => void;
  onDisarm: () => void;
  onMove: (dir: -1 | 1) => void;
}) {
  const meta = MIDDLEWARE_META[step.kind];
  const Icon = MIDDLEWARE_ICONS[step.kind];
  const update = (patch: Partial<MiddlewareStep>) => store().updateMiddlewareStep(endpoint.id, step.id, patch);
  const hasWarning = issues.some((i) => i.severity === 'warning');

  return (
    <div
      onKeyDown={(e) => {
        if (!e.altKey || (e.key !== 'ArrowUp' && e.key !== 'ArrowDown')) return;
        e.preventDefault();
        onMove(e.key === 'ArrowUp' ? -1 : 1);
      }}
      className={`rounded-card border bg-surface transition ${dragging ? 'opacity-40' : ''} ${
        hasWarning ? 'border-warning-line' : 'border-line'
      } ${step.enabled ? '' : 'bg-surface-subtle'}`}
    >
      <div className="flex items-center gap-2 py-2 pr-1.5 pl-1">
        <span
          onPointerDown={onArm}
          onPointerUp={onDisarm}
          className="flex h-7 w-5 shrink-0 cursor-grab items-center justify-center rounded text-fg-muted hover:bg-surface-hover hover:text-fg-secondary active:cursor-grabbing"
          title="Drag to reorder"
          aria-hidden
        >
          <GripVertical className="h-4 w-4" />
        </span>
        <span className="tabular w-4 shrink-0 text-center font-mono text-[11px] text-fg-secondary">{index + 1}</span>
        <label className="flex shrink-0 cursor-pointer items-center" title={step.enabled ? 'Disable step' : 'Enable step'}>
          <input
            type="checkbox"
            className="peer sr-only"
            checked={step.enabled}
            onChange={(e) => update({ enabled: e.target.checked })}
            aria-label={`${meta.label} enabled`}
          />
          <span className="switch" />
        </label>
        <Icon className={`h-4 w-4 shrink-0 ${step.enabled ? 'text-fg' : 'text-fg-muted'}`} />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-1.5">
            <span className={`text-[12.5px] font-medium ${step.enabled ? 'text-fg' : 'text-fg-secondary'}`}>{meta.label}</span>
            <span className="truncate font-mono text-[10.5px] text-fg-secondary">{meta.fn}()</span>
          </div>
          <div className="truncate text-[11px] text-fg-secondary">{meta.description}</div>
        </div>
        <div className="flex shrink-0 items-center">
          <button
            type="button"
            className="btn btn-ghost btn-icon !h-7 !w-7"
            onClick={() => onMove(-1)}
            disabled={index === 0}
            aria-label={`Move ${meta.label} up`}
            title="Move up (Alt+↑)"
          >
            <ArrowUp className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            className="btn btn-ghost btn-icon !h-7 !w-7"
            onClick={() => onMove(1)}
            disabled={index === count - 1}
            aria-label={`Move ${meta.label} down`}
            title="Move down (Alt+↓)"
          >
            <ArrowDown className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            className="btn btn-ghost btn-icon !h-7 !w-7 hover:!bg-danger-soft hover:!text-danger"
            onClick={() => store().removeMiddlewareStep(endpoint.id, step.id)}
            aria-label={`Remove ${meta.label}`}
            title="Remove step"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <StepConfig step={step} method={endpoint.method} collection={collection} update={update} />

      {issues.length > 0 && (
        <div className="space-y-1 border-t border-line px-3 py-2">
          {issues.map((i, n) => (
            <Note key={n} tone={i.severity}>
              {i.message}
            </Note>
          ))}
        </div>
      )}
    </div>
  );
}

function StepConfig({
  step,
  method,
  collection,
  update,
}: {
  step: MiddlewareStep;
  method: HttpMethod;
  collection: CollectionNode;
  update: (patch: Partial<MiddlewareStep>) => void;
}) {
  const collections = useSchemaStore((s) => s.collections);
  const wrap = `flex flex-wrap items-center gap-2 border-t border-line px-3 py-2 text-[11.5px] text-fg-secondary ${step.enabled ? '' : 'opacity-60'}`;

  if (step.kind === 'rateLimit') {
    return (
      <div className={wrap}>
        <label htmlFor={`rpm-${step.id}`}>Limit</label>
        <input
          id={`rpm-${step.id}`}
          type="number"
          min={1}
          max={100000}
          value={step.config?.rpm ?? 60}
          onChange={(e) => {
            const rpm = Math.max(1, Math.min(100000, Math.round(Number(e.target.value) || 1)));
            update({ config: { ...step.config, rpm } });
          }}
          className="field-input tabular !h-7 !w-20 font-mono text-[12px]"
        />
        <span>requests / minute per IP</span>
      </div>
    );
  }

  if (step.kind === 'rbac') {
    const roles = step.config?.roles ?? [];
    // Suggest values from any `role`-like enum in the schema.
    const suggestions = Array.from(
      new Set(
        collections.flatMap((c) =>
          c.fields.filter((f) => f.type === 'Enum' && /role/i.test(f.name)).flatMap((f) => f.validation.enumOptions ?? []),
        ),
      ),
    );
    return (
      <div className={wrap}>
        <span>Roles</span>
        <RolesInput roles={roles} onChange={(next) => update({ config: { ...step.config, roles: next } })} />
        {suggestions
          .filter((r) => !roles.includes(r))
          .map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => update({ config: { ...step.config, roles: [...roles, r] } })}
              className="inline-flex h-6 items-center gap-1 rounded-control border border-dashed border-line-strong px-1.5 font-mono text-[11px] transition hover:border-accent hover:text-fg"
              title={`Allow ${r}`}
            >
              <Plus className="h-3 w-3" />
              {r}
            </button>
          ))}
      </div>
    );
  }

  if (step.kind === 'ownership') {
    const value = step.config?.ownerField ?? 'userId';
    const candidates = collection.fields.filter((f) => f.type === 'ObjectId' || f.type === 'String' || f.type === 'UUID');
    const known = candidates.some((f) => f.name === value);
    return (
      <div className={wrap}>
        <label htmlFor={`owner-${step.id}`}>Owner field</label>
        <div className="relative">
          <select
            id={`owner-${step.id}`}
            value={value}
            onChange={(e) => update({ config: { ...step.config, ownerField: e.target.value } })}
            className="field-input !h-7 !w-auto cursor-pointer appearance-none pr-7 font-mono text-[12px]"
          >
            {!known && <option value={value}>{value} (missing)</option>}
            {candidates.map((f) => (
              <option key={f.id} value={f.name} className="bg-surface">
                {f.name}
              </option>
            ))}
          </select>
          <ChevronDown className="pointer-events-none absolute top-1/2 right-2 h-3 w-3 -translate-y-1/2 text-fg-secondary" />
        </div>
        <span>must equal req.user.id (admins bypass)</span>
      </div>
    );
  }

  if (step.kind === 'auditLog') {
    return (
      <div className={wrap}>
        <span>Action</span>
        <code className="rounded-[4px] bg-surface-subtle px-1.5 py-0.5 font-mono text-[11px] text-fg">
          {`'${method.toLowerCase()}_${modelNameFor(collection.name).toLowerCase()}'`}
        </code>
      </div>
    );
  }

  return null;
}

/** Comma / Enter separated role tokens with removable chips. */
function RolesInput({ roles, onChange }: { roles: string[]; onChange: (roles: string[]) => void }) {
  const [draft, setDraft] = useState('');
  const commit = () => {
    const extra = draft
      .split(',')
      .map((r) => r.trim().replace(/[^\w-]/g, ''))
      .filter(Boolean);
    if (extra.length) onChange(Array.from(new Set([...roles, ...extra])));
    setDraft('');
  };
  return (
    <div className="flex min-h-7 flex-wrap items-center gap-1 rounded-control border border-line bg-surface px-1 py-0.5 focus-within:border-accent">
      {roles.map((r) => (
        <span key={r} className="inline-flex h-5 items-center gap-0.5 rounded-[4px] bg-accent-soft pr-0.5 pl-1.5 font-mono text-[11px] text-fg">
          {r}
          <button
            type="button"
            onClick={() => onChange(roles.filter((x) => x !== r))}
            className="rounded p-0.5 text-fg-secondary hover:text-danger"
            aria-label={`Remove role ${r}`}
          >
            <X className="h-2.5 w-2.5" />
          </button>
        </span>
      ))}
      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ',') {
            e.preventDefault();
            commit();
          } else if (e.key === 'Backspace' && !draft && roles.length) {
            onChange(roles.slice(0, -1));
          }
        }}
        placeholder={roles.length ? '' : 'admin, editor'}
        aria-label="Add role"
        className="h-5 w-24 bg-transparent font-mono text-[11.5px] text-fg outline-none placeholder:text-fg-muted"
      />
    </div>
  );
}

const Note: React.FC<{ tone: 'warning' | 'info'; children: React.ReactNode; className?: string }> = ({ tone, children, className = '' }) => {
  const Icon = tone === 'warning' ? AlertTriangle : Info;
  return (
    <div
      className={`flex items-start gap-1.5 text-[11.5px] leading-snug ${tone === 'warning' ? 'text-warning' : 'text-fg-secondary'} ${className}`}
    >
      <Icon className="mt-[1px] h-3.5 w-3.5 shrink-0" />
      <span>{children}</span>
    </div>
  );
};
