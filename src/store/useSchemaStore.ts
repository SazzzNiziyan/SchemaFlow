import { create, useStore } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { temporal, type TemporalState } from 'zundo';
import type {
  ApiEndpoint,
  CollectionNode,
  MiddlewareStep,
  Relationship,
  RelationshipInput,
  SchemaField,
  SelectionState,
  TargetFramework,
  TemplateId,
  XYPosition,
} from '../types';
import { getTemplate } from '../utils/templates';
import { findFreePosition, layoutCollections, nextCollectionPosition } from '../utils/autoLayout';
import { buildDefaultEndpoints } from '../utils/apiCodeGenerator';
import {
  cloneCollection,
  createId,
  fieldIdFromRelationshipId,
  isCollectionArray,
  mapCollection,
  mapField,
  normalizeCollections,
  pruneDanglingReferences,
  reconcileSelection,
  relationshipIdForField,
  remapCollidingIds,
  sameSelection,
} from '../utils/schemaOps';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SchemaState extends SelectionState {
  collections: CollectionNode[];
  framework: TargetFramework;
  /** Display name of the project (top bar). Not part of undo history. */
  projectName: string;
  endpoints: ApiEndpoint[];
  selectedEndpointId: string | null;
}

export type CollectionPatch = Partial<Omit<CollectionNode, 'id' | 'fields'>>;
export type FieldPatch = Partial<Omit<SchemaField, 'id'>>;

export interface ImportOptions {
  /** `replace` swaps the whole schema; `merge` appends (re-iding collisions). */
  mode: 'replace' | 'merge';
  /**
   * Applied to the final collection list before it is committed (e.g. a
   * layout pass), so import + arrange land as a single undo step.
   */
  transform?: (collections: CollectionNode[]) => CollectionNode[];
}

export interface SchemaActions {
  /**
   * Adds a collection and selects it. Placed at `options.position` when given,
   * otherwise below the current graph. Returns its id.
   */
  addCollection: (collection: CollectionNode, options?: { position?: XYPosition }) => string;
  /** Shallow-merges `patch`. Blank names are ignored; names are trimmed. */
  updateCollection: (id: string, patch: CollectionPatch) => void;
  /** Removes a collection and any references pointing at it. */
  deleteCollection: (id: string) => void;
  /** Clones a collection (fresh ids) 350px to the right and selects it. */
  duplicateCollection: (id: string) => void;

  /** Appends a field (defaults to `newField: String`) and selects it. Returns its id. */
  addField: (collectionId: string, field?: Partial<SchemaField>) => string | null;
  updateField: (collectionId: string, fieldId: string, patch: FieldPatch) => void;
  /** Removes a field and any references pointing at it. */
  deleteField: (collectionId: string, fieldId: string) => void;
  reorderFields: (collectionId: string, fromIndex: number, toIndex: number) => void;

  /** Turns `sourceFieldId` into a foreign key to the target. Returns the relationship id. */
  addRelationship: (input: RelationshipInput) => string;
  /** Retargets, re-types, or moves (via a new source field) an existing relationship. */
  updateRelationship: (relationshipId: string, patch: Partial<RelationshipInput>) => void;
  deleteRelationship: (relationshipId: string) => void;

  /**
   * Selects a collection. Keeps the selected field if it belongs to the
   * collection, otherwise falls back to the collection's first field.
   * `null` clears the selection.
   */
  setSelectedCollection: (collectionId: string | null) => void;
  /** Selects a field (and its collection), or clears only the field with `null`. */
  setSelectedField: (fieldId: string | null, collectionId?: string) => void;

  setFramework: (framework: TargetFramework) => void;
  /** Renames the project; blank names are ignored. */
  setProjectName: (name: string) => void;
  loadTemplate: (templateId: TemplateId) => void;
  importSchema: (collections: CollectionNode[], options: ImportOptions) => void;
  clearCanvas: () => void;
  /** Atomically replaces all collections (recorded as a single undo step). */
  replaceCollections: (collections: CollectionNode[]) => void;
  /**
   * Applies collections parsed from edited code as a single undo step.
   *
   * - Parsed collections whose id exists on the canvas replace it (keeping its
   *   current position); new ones are appended at a free spot.
   * - Canvas collections in `scopeIds` (what the editor was showing) that are
   *   missing from `parsed` were deleted in code and are removed.
   * - Everything outside `scopeIds` is left untouched, so editing a single
   *   collection never disturbs the rest of the canvas.
   */
  syncFromCode: (parsed: CollectionNode[], scopeIds: string[]) => CodeSyncSummary;
  /** Re-positions collections using a layout function (positions only). */
  applyLayout: (layout: (collections: CollectionNode[]) => CollectionNode[]) => void;

  // ----- API Endpoints & Middlewares --------------------------------
  /** Generates sensible CRUD endpoints for the collection, replacing any existing ones. */
  generateDefaultEndpointsForCollection: (collectionId: string) => void;
  addEndpoint: (endpoint: Omit<ApiEndpoint, 'id'> & { id?: string }) => string;
  updateEndpoint: (id: string, patch: Partial<Omit<ApiEndpoint, 'id'>>) => void;
  deleteEndpoint: (id: string) => void;
  setSelectedEndpoint: (endpointId: string | null) => void;
  addMiddlewareStep: (
    endpointId: string,
    step: Omit<MiddlewareStep, 'id' | 'order'> & { id?: string; order?: number },
  ) => string | null;
  updateMiddlewareStep: (
    endpointId: string,
    stepId: string,
    patch: Partial<Omit<MiddlewareStep, 'id'>>,
  ) => void;
  removeMiddlewareStep: (endpointId: string, stepId: string) => void;
  reorderMiddlewareSteps: (endpointId: string, fromIndex: number, toIndex: number) => void;
}

export interface CodeSyncSummary {
  added: number;
  updated: number;
  removed: number;
  /** False when the code matched the canvas exactly (no undo step recorded). */
  changed: boolean;
}

export type SchemaStore = SchemaState & SchemaActions;

/** JSON with sorted keys, ignoring `undefined` / `false` / empty arrays (semantic equality). */
function canonicalJson(value: unknown): string {
  return JSON.stringify(value, (_k, v) => {
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      const out: Record<string, unknown> = {};
      for (const key of Object.keys(v).sort()) {
        const x = v[key];
        if (x === undefined || x === false || (Array.isArray(x) && x.length === 0)) continue;
        out[key] = x;
      }
      return out;
    }
    return v;
  });
}

/** Slice of state recorded by undo/redo. Selection & framework are not history. */
type HistorySlice = Pick<SchemaState, 'collections' | 'endpoints'>;

// ---------------------------------------------------------------------------
// History grouping
//
// Each `set` normally becomes one undo step. Bursty edits (typing a field
// name, toggling a flag repeatedly) run inside a named group: consecutive
// writes with the same group key less than COALESCE_MS apart collapse into
// the first step, so undo reverts the whole burst. Canvas drags never reach
// the store until drag-stop, so a move is always exactly one step.
// ---------------------------------------------------------------------------

const COALESCE_MS = 1000;
let activeGroup: string | null = null;
let lastGroup: string | null = null;
let lastWriteAt = 0;

function inHistoryGroup<T>(key: string, fn: () => T): T {
  const prev = activeGroup;
  activeGroup = key;
  try {
    return fn();
  } finally {
    activeGroup = prev;
  }
}

let batchCounter = 0;
/** Runs several store actions as a single undo step. */
export function batchHistory(fn: () => void): void {
  inHistoryGroup(`batch:${++batchCounter}`, fn);
}

type RecordHistory = (past: HistorySlice, replace: undefined, current: HistorySlice, delta?: Partial<HistorySlice> | null) => void;

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

const DEFAULT_TEMPLATE: TemplateId = 'saas';

const initialState: SchemaState = {
  collections: layoutCollections(getTemplate(DEFAULT_TEMPLATE)),
  framework: 'mongoose',
  projectName: 'SaaS Platform',
  selectedCollectionId: 'col_saas_orgs',
  selectedFieldId: 'f_org_1',
  endpoints: [],
  selectedEndpointId: null,
};

/** Selection pointing at the first collection / field (or nothing). */
const selectFirst = (cols: CollectionNode[]): SelectionState => ({
  selectedCollectionId: cols[0]?.id ?? null,
  selectedFieldId: cols[0]?.fields[0]?.id ?? null,
});

export const STORAGE_KEY = 'schemaflow:workspace';
export const STORAGE_VERSION = 1;

type PersistedState = Pick<
  SchemaState,
  | 'collections'
  | 'framework'
  | 'projectName'
  | 'selectedCollectionId'
  | 'selectedFieldId'
  | 'endpoints'
  | 'selectedEndpointId'
>;

export const useSchemaStore = create<SchemaStore>()(
  persist(
    temporal(
      (set, get) => ({
        ...initialState,

        // ----- Collections ------------------------------------------------
        addCollection: (collection, options) => {
          const { collections } = get();
          const [normalized] = normalizeCollections(remapCollidingIds([collection], collections));
          const placed = { ...normalized, position: options?.position ?? nextCollectionPosition(collections) };
          set({
            collections: [...collections, placed],
            selectedCollectionId: placed.id,
            selectedFieldId: placed.fields[0]?.id ?? null,
          });
          return placed.id;
        },

        updateCollection: (id, patch) => {
          const next = { ...patch };
          if (next.name !== undefined) {
            const trimmed = next.name.trim();
            if (trimmed) next.name = trimmed;
            else delete next.name;
          }
          set((s) => ({
            collections: mapCollection(s.collections, id, (col) => {
              const changed = (Object.keys(next) as (keyof CollectionPatch)[]).some((k) =>
                k === 'position'
                  ? next.position!.x !== col.position.x || next.position!.y !== col.position.y
                  : next[k] !== col[k],
              );
              return changed ? { ...col, ...next } : col;
            }),
          }));
        },

        deleteCollection: (id) => {
          const s = get();
          if (!s.collections.some((c) => c.id === id)) return;
          const collections = pruneDanglingReferences(s.collections.filter((c) => c.id !== id));
          const endpoints = s.endpoints.filter((e) => e.collectionId !== id);
          const selectedEndpointId =
            endpoints.some((e) => e.id === s.selectedEndpointId)
              ? s.selectedEndpointId
              : (endpoints[0]?.id ?? null);
          const selection =
            s.selectedCollectionId === id
              ? selectFirst(collections)
              : reconcileSelection(collections, s);
          set({ collections, endpoints, selectedEndpointId, ...selection });
        },

        duplicateCollection: (id) => {
          const source = get().collections.find((c) => c.id === id);
          if (!source) return;
          const copy = cloneCollection(source, { offset: { x: 350, y: 0 } });
          set((s) => ({
            collections: [...s.collections, copy],
            selectedCollectionId: copy.id,
            selectedFieldId: copy.fields[0]?.id ?? null,
          }));
        },

        // ----- Fields -----------------------------------------------------
        addField: (collectionId, field) => {
          if (!get().collections.some((c) => c.id === collectionId)) return null;
          const newField: SchemaField = {
            name: 'newField',
            type: 'String',
            ...field,
            validation: { required: false, ...field?.validation },
            id: createId('f'),
          };
          set((s) => ({
            collections: mapCollection(s.collections, collectionId, (col) => ({
              ...col,
              fields: [...col.fields, newField],
            })),
            selectedCollectionId: collectionId,
            selectedFieldId: newField.id,
          }));
          return newField.id;
        },

        updateField: (collectionId, fieldId, patch) => {
          const groupKey = `field:${fieldId}:${Object.keys(patch).sort().join(',')}`;
          inHistoryGroup(groupKey, () =>
            set((s) => ({
              collections: mapField(s.collections, collectionId, fieldId, (f) => ({ ...f, ...patch })),
            })),
          );
        },

        deleteField: (collectionId, fieldId) => {
          const s = get();
          const col = s.collections.find((c) => c.id === collectionId);
          if (!col?.fields.some((f) => f.id === fieldId)) return;
          const collections = pruneDanglingReferences(
            mapCollection(s.collections, collectionId, (c) => ({
              ...c,
              fields: c.fields.filter((f) => f.id !== fieldId),
            })),
          );
          const selectedFieldId =
            s.selectedFieldId === fieldId
              ? collections.find((c) => c.id === collectionId)?.fields[0]?.id ?? null
              : s.selectedFieldId;
          set({ collections, selectedFieldId });
        },

        reorderFields: (collectionId, fromIndex, toIndex) => {
          set((s) => ({
            collections: mapCollection(s.collections, collectionId, (col) => {
              const n = col.fields.length;
              if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0 || fromIndex >= n || toIndex >= n) return col;
              const fields = [...col.fields];
              const [moved] = fields.splice(fromIndex, 1);
              fields.splice(toIndex, 0, moved);
              return { ...col, fields };
            }),
          }));
        },

        // ----- Relationships ----------------------------------------------
        addRelationship: ({ sourceCollectionId, sourceFieldId, targetCollectionId, targetFieldId, type }) => {
          set((s) => ({
            collections: mapField(s.collections, sourceCollectionId, sourceFieldId, (f) => ({
              ...f,
              isForeignKey: true,
              foreignKeyRef: {
                targetCollectionId,
                targetFieldId,
                ...(type && type !== 'one-to-many' ? { relationType: type } : {}),
              },
            })),
          }));
          return relationshipIdForField(sourceFieldId);
        },

        updateRelationship: (relationshipId, patch) => {
          const current = selectRelationship(get(), relationshipId);
          if (!current) return;
          const merged: Relationship = { ...current, ...patch, id: current.id };
          const movedSource =
            merged.sourceFieldId !== current.sourceFieldId || merged.sourceCollectionId !== current.sourceCollectionId;
          batchHistory(() => {
            if (movedSource) get().deleteRelationship(relationshipId);
            get().addRelationship(merged);
          });
        },

        deleteRelationship: (relationshipId) => {
          const rel = selectRelationship(get(), relationshipId);
          if (!rel) return;
          set((s) => ({
            collections: mapField(s.collections, rel.sourceCollectionId, rel.sourceFieldId, (f) => ({
              ...f,
              isForeignKey: false,
              foreignKeyRef: undefined,
            })),
          }));
        },

        // ----- Selection --------------------------------------------------
        setSelectedCollection: (collectionId) => {
          if (!collectionId) {
            set({ selectedCollectionId: null, selectedFieldId: null });
            return;
          }
          const { collections, selectedFieldId } = get();
          const col = collections.find((c) => c.id === collectionId);
          const keepField = !!col && !!selectedFieldId && col.fields.some((f) => f.id === selectedFieldId);
          set({
            selectedCollectionId: collectionId,
            selectedFieldId: keepField ? selectedFieldId : col?.fields[0]?.id ?? selectedFieldId,
          });
        },

        setSelectedField: (fieldId, collectionId) => {
          if (collectionId) set({ selectedCollectionId: collectionId, selectedFieldId: fieldId });
          else set({ selectedFieldId: fieldId });
        },

        // ----- Document-level ---------------------------------------------
        setFramework: (framework) => set({ framework }),

        setProjectName: (name) => {
          const trimmed = name.trim();
          if (trimmed) set({ projectName: trimmed.slice(0, 80) });
        },

        loadTemplate: (templateId) => {
          const raw = getTemplate(templateId);
          const collections = layoutCollections(raw);
          set({ collections, ...selectFirst(collections) });
        },

        importSchema: (incoming, { mode, transform }) => {
          if (!isCollectionArray(incoming)) {
            console.warn('[schema] importSchema ignored invalid payload', incoming);
            return;
          }
          const existing = get().collections;
          const normalized = normalizeCollections(mode === 'merge' ? remapCollidingIds(incoming, existing) : incoming);
          const merged = pruneDanglingReferences(mode === 'merge' ? [...existing, ...normalized] : normalized);
          const collections = transform ? transform(merged) : merged;
          // Select the first imported collection (not the first existing one).
          const firstImported = collections.find((c) => c.id === normalized[0]?.id);
          set({
            collections,
            selectedCollectionId: firstImported?.id ?? null,
            selectedFieldId: firstImported?.fields[0]?.id ?? null,
          });
        },

        clearCanvas: () =>
          set({
            collections: [],
            selectedCollectionId: null,
            selectedFieldId: null,
            endpoints: [],
            selectedEndpointId: null,
          }),

        replaceCollections: (collections) => set({ collections }),

        syncFromCode: (parsed, scopeIds) => {
          const s = get();
          const scope = new Set(scopeIds);
          const incoming = new Map(normalizeCollections(parsed).map((c) => [c.id, c]));
          const summary: CodeSyncSummary = { added: 0, updated: 0, removed: 0, changed: false };
          const next: CollectionNode[] = [];

          for (const col of s.collections) {
            const p = incoming.get(col.id);
            incoming.delete(col.id);
            if (!p) {
              if (scope.has(col.id)) summary.removed++;
              else next.push(col);
              continue;
            }
            // The node may have been dragged while editing: the canvas owns layout.
            const merged = { ...p, position: col.position };
            if (canonicalJson(merged) === canonicalJson(col)) next.push(col);
            else {
              next.push(merged);
              summary.updated++;
            }
          }
          for (const p of incoming.values()) {
            const position = findFreePosition(next, nextCollectionPosition(next), p.fields.length);
            next.push({ ...p, position });
            summary.added++;
          }

          summary.changed = summary.added + summary.updated + summary.removed > 0;
          if (!summary.changed) return summary;
          const collections = pruneDanglingReferences(next);
          set({ collections, ...reconcileSelection(collections, s) });
          return summary;
        },

        applyLayout: (layout) => {
          const { collections } = get();
          if (collections.length === 0) return;
          const positions = new Map(layout(collections).map((c) => [c.id, c.position]));
          let changed = false;
          const next = collections.map((c) => {
            const p = positions.get(c.id);
            if (!p || (p.x === c.position.x && p.y === c.position.y)) return c;
            changed = true;
            return { ...c, position: p };
          });
          if (changed) set({ collections: next });
        },

        // ----- API Endpoints & Middlewares --------------------------------
        generateDefaultEndpointsForCollection: (collectionId) => {
          const col = get().collections.find((c) => c.id === collectionId);
          if (!col) return;
          const generated = buildDefaultEndpoints(col);
          set((s) => {
            const retained = s.endpoints.filter((e) => e.collectionId !== collectionId);
            const nextEndpoints = [...retained, ...generated];
            return {
              endpoints: nextEndpoints,
              selectedEndpointId: generated[0]?.id ?? s.selectedEndpointId,
            };
          });
        },

        addEndpoint: (endpoint) => {
          const id = endpoint.id || createId('ep');
          const newEndpoint: ApiEndpoint = {
            ...endpoint,
            id,
            middlewares: (endpoint.middlewares || []).map((m, idx) => ({
              ...m,
              id: m.id || createId('mw'),
              order: typeof m.order === 'number' ? m.order : idx,
            })),
          };
          set((s) => ({
            endpoints: [...s.endpoints, newEndpoint],
            selectedEndpointId: id,
          }));
          return id;
        },

        updateEndpoint: (id, patch) => {
          // Typing a path / summary coalesces into one undo step per field.
          const groupKey = `endpoint:${id}:${Object.keys(patch).sort().join(',')}`;
          inHistoryGroup(groupKey, () =>
            set((s) => ({
              endpoints: s.endpoints.map((ep) => (ep.id === id ? { ...ep, ...patch } : ep)),
            })),
          );
        },

        deleteEndpoint: (id) => {
          set((s) => {
            const nextEndpoints = s.endpoints.filter((ep) => ep.id !== id);
            const selectedEndpointId =
              s.selectedEndpointId === id ? (nextEndpoints[0]?.id ?? null) : s.selectedEndpointId;
            return { endpoints: nextEndpoints, selectedEndpointId };
          });
        },

        setSelectedEndpoint: (endpointId) => {
          set({ selectedEndpointId: endpointId });
        },

        addMiddlewareStep: (endpointId, step) => {
          const target = get().endpoints.find((ep) => ep.id === endpointId);
          if (!target) return null;
          const id = step.id || createId('mw');
          const order = typeof step.order === 'number' ? step.order : target.middlewares.length;
          const newStep: MiddlewareStep = {
            ...step,
            id,
            order,
          };
          set((s) => ({
            endpoints: s.endpoints.map((ep) => {
              if (ep.id !== endpointId) return ep;
              const middlewares = [...ep.middlewares, newStep].sort((a, b) => a.order - b.order);
              return { ...ep, middlewares };
            }),
          }));
          return id;
        },

        updateMiddlewareStep: (endpointId, stepId, patch) => {
          const groupKey = `mw:${stepId}:${Object.keys(patch).sort().join(',')}`;
          inHistoryGroup(groupKey, () =>
            set((s) => ({
              endpoints: s.endpoints.map((ep) => {
                if (ep.id !== endpointId) return ep;
                const middlewares = ep.middlewares
                  .map((m) => (m.id === stepId ? { ...m, ...patch } : m))
                  .sort((a, b) => a.order - b.order);
                return { ...ep, middlewares };
              }),
            })),
          );
        },

        removeMiddlewareStep: (endpointId, stepId) => {
          set((s) => ({
            endpoints: s.endpoints.map((ep) => {
              if (ep.id !== endpointId) return ep;
              const middlewares = ep.middlewares
                .filter((m) => m.id !== stepId)
                .map((m, idx) => ({ ...m, order: idx }));
              return { ...ep, middlewares };
            }),
          }));
        },

        reorderMiddlewareSteps: (endpointId, fromIndex, toIndex) => {
          set((s) => ({
            endpoints: s.endpoints.map((ep) => {
              if (ep.id !== endpointId) return ep;
              const n = ep.middlewares.length;
              if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0 || fromIndex >= n || toIndex >= n) return ep;
              const list = [...ep.middlewares];
              const [moved] = list.splice(fromIndex, 1);
              list.splice(toIndex, 0, moved);
              return {
                ...ep,
                middlewares: list.map((m, idx) => ({ ...m, order: idx })),
              };
            }),
          }));
        },
      }),
      {
        partialize: (state): HistorySlice => ({
          collections: state.collections,
          endpoints: state.endpoints,
        }),
        // Selection / framework changes leave collections and endpoints untouched → no history entry.
        equality: (past, current) =>
          past.collections === current.collections && past.endpoints === current.endpoints,
        limit: 100,
        handleSet: (record) => (past, replace, current, delta) => {
          const now = Date.now();
          const coalesce = activeGroup !== null && activeGroup === lastGroup && now - lastWriteAt < COALESCE_MS;
          lastGroup = activeGroup;
          lastWriteAt = now;
          if (!coalesce) (record as unknown as RecordHistory)(past as HistorySlice, replace as undefined, current, delta);
        },
      },
    ),
    {
      name: STORAGE_KEY,
      version: STORAGE_VERSION,
      storage: createJSONStorage(() =>
        typeof window !== 'undefined' && window.localStorage
          ? window.localStorage
          : {
              getItem: () => null,
              setItem: () => {},
              removeItem: () => {},
            },
      ),
      partialize: (s): PersistedState => ({
        collections: s.collections,
        framework: s.framework,
        projectName: s.projectName,
        selectedCollectionId: s.selectedCollectionId,
        selectedFieldId: s.selectedFieldId,
        endpoints: s.endpoints,
        selectedEndpointId: s.selectedEndpointId,
      }),
      migrate: (persisted, version) => {
        // v1 is the first persisted shape. Future versions transform `persisted` here.
        if (version > STORAGE_VERSION) return {} as PersistedState;
        return persisted as PersistedState;
      },
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<PersistedState>;
        if (!isCollectionArray(p.collections)) return current;
        const collections = pruneDanglingReferences(normalizeCollections(p.collections));
        const selection = reconcileSelection(collections, {
          selectedCollectionId: p.selectedCollectionId ?? null,
          selectedFieldId: p.selectedFieldId ?? null,
        });
        const endpoints = Array.isArray(p.endpoints) ? p.endpoints : [];
        const selectedEndpointId =
          endpoints.some((e) => e.id === p.selectedEndpointId)
            ? (p.selectedEndpointId ?? null)
            : (endpoints[0]?.id ?? null);
        return {
          ...current,
          framework: p.framework ?? current.framework,
          projectName: typeof p.projectName === 'string' && p.projectName.trim() ? p.projectName : current.projectName,
          collections,
          ...selection,
          endpoints,
          selectedEndpointId,
        };
      },
    },
  ),
);

// ---------------------------------------------------------------------------
// Selectors & history helpers
// ---------------------------------------------------------------------------

export function selectRelationship(state: SchemaState, relationshipId: string): Relationship | undefined {
  const fieldId = fieldIdFromRelationshipId(relationshipId);
  for (const col of state.collections) {
    const f = col.fields.find((x) => x.id === fieldId);
    if (f?.isForeignKey && f.foreignKeyRef) {
      return {
        id: relationshipId,
        sourceCollectionId: col.id,
        sourceFieldId: f.id,
        targetCollectionId: f.foreignKeyRef.targetCollectionId,
        targetFieldId: f.foreignKeyRef.targetFieldId,
        type: f.foreignKeyRef.relationType ?? 'one-to-many',
      };
    }
  }
  return undefined;
}

/** Subscribe to the undo/redo store with a selector. */
export function useSchemaHistory<T>(selector: (state: TemporalState<HistorySlice>) => T): T {
  return useStore(useSchemaStore.temporal, selector);
}

export const useCanUndo = () => useSchemaHistory((s) => s.pastStates.length > 0);
export const useCanRedo = () => useSchemaHistory((s) => s.futureStates.length > 0);

/** Restores `collections` and repairs any selection that no longer exists. */
function afterTimeTravel() {
  lastGroup = null; // next edit always starts a fresh undo step
  const s = useSchemaStore.getState();
  const selection = reconcileSelection(s.collections, s);
  const patch: Partial<SchemaState> = {};
  if (!sameSelection(selection, s)) Object.assign(patch, selection);
  if (s.selectedEndpointId && !s.endpoints.some((e) => e.id === s.selectedEndpointId)) {
    patch.selectedEndpointId = s.endpoints[0]?.id ?? null;
  }
  if (Object.keys(patch).length > 0) useSchemaStore.setState(patch);
}

export function undo() {
  useSchemaStore.temporal.getState().undo();
  afterTimeTravel();
}

export function redo() {
  useSchemaStore.temporal.getState().redo();
  afterTimeTravel();
}
