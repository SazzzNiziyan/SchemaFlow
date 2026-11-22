import { CollectionNode, Relationship, RelationshipType, SchemaField, SelectionState } from '../types';

/** Collision-resistant id with a readable prefix, e.g. `col_lq3k9x_ab12cd`. */
export function createId(prefix: 'col' | 'f' | 'idx' | 'ep' | 'mw' | string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/** Relationship ids are derived from the child field, which holds at most one ref. */
export const relationshipIdForField = (fieldId: string) => `rel_${fieldId}`;
export const fieldIdFromRelationshipId = (relId: string) => relId.replace(/^rel_/, '');

/** Projects foreign-key fields into edge-shaped {@link Relationship}s. */
export function deriveRelationships(collections: CollectionNode[]): Relationship[] {
  const rels: Relationship[] = [];
  for (const col of collections) {
    for (const field of col.fields) {
      if (field.isForeignKey && field.foreignKeyRef?.targetCollectionId) {
        rels.push({
          id: relationshipIdForField(field.id),
          sourceCollectionId: col.id,
          sourceFieldId: field.id,
          targetCollectionId: field.foreignKeyRef.targetCollectionId,
          targetFieldId: field.foreignKeyRef.targetFieldId,
          type: field.foreignKeyRef.relationType ?? 'one-to-many',
        });
      }
    }
  }
  return rels;
}

export function countRelationships(collections: CollectionNode[]): number {
  let n = 0;
  for (const col of collections) for (const f of col.fields) if (f.isForeignKey) n++;
  return n;
}

/** Short label for edge badges. */
export const RELATIONSHIP_LABELS: Record<RelationshipType, string> = {
  'one-to-one': '1:1',
  'one-to-many': '1:N',
  'many-to-many': 'N:M',
};

/** Immutably applies `fn` to one collection. Returns the original array when nothing matched. */
export function mapCollection(
  collections: CollectionNode[],
  colId: string,
  fn: (col: CollectionNode) => CollectionNode,
): CollectionNode[] {
  let changed = false;
  const next = collections.map((c) => {
    if (c.id !== colId) return c;
    const updated = fn(c);
    if (updated !== c) changed = true;
    return updated;
  });
  return changed ? next : collections;
}

/** Immutably applies `fn` to one field. Returns the original array when nothing matched. */
export function mapField(
  collections: CollectionNode[],
  colId: string,
  fieldId: string,
  fn: (field: SchemaField) => SchemaField,
): CollectionNode[] {
  return mapCollection(collections, colId, (col) => {
    let changed = false;
    const fields = col.fields.map((f) => {
      if (f.id !== fieldId) return f;
      const updated = fn(f);
      if (updated !== f) changed = true;
      return updated;
    });
    return changed ? { ...col, fields } : col;
  });
}

/** Drops foreign keys whose target collection or field no longer exists. */
export function pruneDanglingReferences(collections: CollectionNode[]): CollectionNode[] {
  const fieldIndex = new Map<string, Set<string>>();
  collections.forEach((c) => fieldIndex.set(c.id, new Set(c.fields.map((f) => f.id))));

  let anyChanged = false;
  const next = collections.map((col) => {
    let changed = false;
    const fields = col.fields.map((f) => {
      if (!f.isForeignKey || !f.foreignKeyRef) return f;
      const targetFields = fieldIndex.get(f.foreignKeyRef.targetCollectionId);
      if (targetFields && targetFields.has(f.foreignKeyRef.targetFieldId)) return f;
      changed = true;
      return { ...f, isForeignKey: false, foreignKeyRef: undefined };
    });
    if (!changed) return col;
    anyChanged = true;
    return { ...col, fields };
  });
  return anyChanged ? next : collections;
}

export interface CloneOptions {
  nameSuffix?: string;
  offset?: { x: number; y: number };
  /** Strip foreign keys from cloned fields (used by paste). */
  stripForeignKeys?: boolean;
}

/** Deep-clones a collection with fresh collection and field ids. */
export function cloneCollection(col: CollectionNode, opts: CloneOptions = {}): CollectionNode {
  const { nameSuffix = ' Copy', offset = { x: 0, y: 0 }, stripForeignKeys = false } = opts;
  const copy = structuredClone(col);
  return {
    ...copy,
    id: createId('col'),
    name: `${col.name}${nameSuffix}`,
    position: { x: col.position.x + offset.x, y: col.position.y + offset.y },
    fields: copy.fields.map((f) => ({
      ...f,
      id: createId('f'),
      ...(stripForeignKeys ? { isForeignKey: false, foreignKeyRef: undefined } : {}),
    })),
  };
}

/**
 * Ensures a selection only points at things that exist. Always returns a new
 * object containing only the two selection keys (safe to spread into state).
 */
export function reconcileSelection(collections: CollectionNode[], sel: SelectionState): SelectionState {
  const col = sel.selectedCollectionId ? collections.find((c) => c.id === sel.selectedCollectionId) : undefined;
  if (!col) return { selectedCollectionId: null, selectedFieldId: null };
  const fieldExists = !!sel.selectedFieldId && col.fields.some((f) => f.id === sel.selectedFieldId);
  return { selectedCollectionId: col.id, selectedFieldId: fieldExists ? sel.selectedFieldId : null };
}

export const sameSelection = (a: SelectionState, b: SelectionState) =>
  a.selectedCollectionId === b.selectedCollectionId && a.selectedFieldId === b.selectedFieldId;

/** Runtime guard for untrusted (persisted / imported / AI-generated) schema data. */
export function isCollectionArray(value: unknown): value is CollectionNode[] {
  return (
    Array.isArray(value) &&
    value.every(
      (c) =>
        c &&
        typeof c === 'object' &&
        typeof (c as CollectionNode).id === 'string' &&
        typeof (c as CollectionNode).name === 'string' &&
        Array.isArray((c as CollectionNode).fields),
    )
  );
}

/**
 * Fills in optional-but-assumed properties on untrusted collections so the
 * rest of the app can rely on them (position, validation object, etc.).
 */
export function normalizeCollections(cols: CollectionNode[]): CollectionNode[] {
  return cols.map((c) => ({
    ...c,
    icon: c.icon ?? 'Table',
    colorTag: c.colorTag ?? '#afc6ff',
    position:
      c.position && Number.isFinite(c.position.x) && Number.isFinite(c.position.y) ? c.position : { x: 0, y: 0 },
    fields: c.fields.map((f) => ({ ...f, validation: f.validation ?? {} })),
  }));
}

/**
 * Re-ids incoming collections/fields that collide with existing ones so a
 * merge import never produces duplicate React keys or ambiguous references.
 * References inside the incoming set follow their remapped targets.
 */
export function remapCollidingIds(incoming: CollectionNode[], existing: CollectionNode[]): CollectionNode[] {
  const takenCols = new Set(existing.map((c) => c.id));
  const takenFields = new Set(existing.flatMap((c) => c.fields.map((f) => f.id)));
  const colMap = new Map<string, string>();
  const fieldMap = new Map<string, string>();

  for (const col of incoming) {
    if (takenCols.has(col.id)) colMap.set(col.id, createId('col'));
    takenCols.add(colMap.get(col.id) ?? col.id);
    for (const f of col.fields) {
      if (takenFields.has(f.id)) fieldMap.set(f.id, createId('f'));
      takenFields.add(fieldMap.get(f.id) ?? f.id);
    }
  }
  if (colMap.size === 0 && fieldMap.size === 0) return incoming;

  return incoming.map((col) => ({
    ...col,
    id: colMap.get(col.id) ?? col.id,
    fields: col.fields.map((f) => ({
      ...f,
      id: fieldMap.get(f.id) ?? f.id,
      foreignKeyRef: f.foreignKeyRef && {
        ...f.foreignKeyRef,
        targetCollectionId: colMap.get(f.foreignKeyRef.targetCollectionId) ?? f.foreignKeyRef.targetCollectionId,
        targetFieldId: fieldMap.get(f.foreignKeyRef.targetFieldId) ?? f.foreignKeyRef.targetFieldId,
      },
    })),
  }));
}
