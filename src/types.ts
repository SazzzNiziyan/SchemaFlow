/**
 * SchemaFlow domain model.
 *
 * The persisted schema document is intentionally small: a list of
 * {@link CollectionNode}s, each owning its {@link SchemaField}s. Relationships
 * are stored on the referencing (child) field via {@link ForeignKeyRef} so there
 * is exactly one source of truth; {@link Relationship} is the derived,
 * edge-shaped view used by the canvas, relationship editor and auditors.
 */

// ---------------------------------------------------------------------------
// Primitive enums
// ---------------------------------------------------------------------------

/** Logical data type of a field, mapped per-framework by the code generators. */
export type FieldType =
  | 'String'
  | 'Number'
  | 'Boolean'
  | 'Date'
  | 'ObjectId'
  | 'Array'
  | 'Enum'
  | 'JSON'
  | 'Decimal'
  | 'UUID';

/** Code generation targets supported by `src/utils/codeGenerators.ts`. */
export type TargetFramework = 'mongoose' | 'prisma' | 'postgres' | 'drizzle' | 'typescript' | 'jsonSchema';

/** Cardinality of a relationship, read from the parent's point of view. */
export type RelationshipType = 'one-to-one' | 'one-to-many' | 'many-to-many';

/** Two-dimensional point in React Flow canvas coordinates. */
export interface XYPosition {
  x: number;
  y: number;
}

// ---------------------------------------------------------------------------
// Fields
// ---------------------------------------------------------------------------

/** Validation and constraint rules applied to a single field. */
export interface FieldValidation {
  /** Field must be present (NOT NULL / `required: true`). */
  required?: boolean;
  /** Field value must be unique across the collection (creates a unique index). */
  unique?: boolean;
  /** Exclude from default Mongoose queries (`select: false`). */
  select?: boolean;
  /** Regex pattern as a string literal, e.g. `'/^\\S+@\\S+$/'`. */
  match?: string;
  /** Default value expression, e.g. `'Date.now'`, `'0'`, `"'pending'"`. */
  defaultVal?: string;
  /** Minimum numeric value or minimum string length. */
  min?: number;
  /** Maximum numeric value or maximum string length. */
  max?: number;
  /** Allowed values when `type === 'Enum'`. */
  enumOptions?: string[];
}

/** Sort / index kind used when building single-field or compound indexes. */
export type IndexDirection = 1 | -1 | 'text' | 'hashed' | '2dsphere';

/** Secondary index options for a single field. `unique` lives in {@link FieldValidation}. */
export interface FieldIndexOptions {
  /** Whether a (non-unique) secondary index should be created for this field. */
  indexed: boolean;
  /** Index kind / sort direction. Defaults to ascending (`1`). */
  direction?: IndexDirection;
  /** Only index documents where the field exists. */
  sparse?: boolean;
  /**
   * Time-to-live in seconds. Only meaningful on `Date` fields; documents expire
   * `ttlSeconds` after the stored date (MongoDB `expireAfterSeconds`).
   */
  ttlSeconds?: number;
  /** Optional explicit index name. */
  name?: string;
}

/** Metadata for `type === 'Array'` fields. */
export interface ArrayFieldMeta {
  /** Element type of the array. */
  itemType: FieldType;
  /** For arrays of `ObjectId`, the referenced collection (array-of-refs / N:M). */
  itemRefCollectionId?: string;
  minItems?: number;
  maxItems?: number;
}

/** Metadata for embedded sub-documents (`type === 'JSON'` with a known shape). */
export interface NestedFieldMeta {
  /** Fields of the embedded document. Nested fields cannot carry foreign keys. */
  fields: SchemaField[];
}

/** Reference from a child field to a parent collection's field. */
export interface ForeignKeyRef {
  targetCollectionId: string;
  targetFieldId: string;
  /** Cardinality of this reference. Absent means `'one-to-many'` (legacy data). */
  relationType?: RelationshipType;
}

/** A single field (column / document property) within a collection. */
export interface SchemaField {
  id: string;
  name: string;
  type: FieldType;
  /** Human-readable notes, surfaced in docs and generated comments. */
  description?: string;
  isPrimaryKey?: boolean;
  /** True when {@link foreignKeyRef} is set; kept for generator compatibility. */
  isForeignKey?: boolean;
  foreignKeyRef?: ForeignKeyRef;
  validation: FieldValidation;
  /** Secondary index / TTL configuration. */
  index?: FieldIndexOptions;
  /** Present when `type === 'Array'`. */
  array?: ArrayFieldMeta;
  /** Present for embedded documents. */
  nested?: NestedFieldMeta;
}

// ---------------------------------------------------------------------------
// Collections
// ---------------------------------------------------------------------------

/** Multi-field index declared at the collection level. */
export interface CompoundIndex {
  id: string;
  name?: string;
  /** Ordered list of participating fields and their direction. */
  fields: { fieldId: string; direction: IndexDirection }[];
  unique?: boolean;
  sparse?: boolean;
}

/** A collection (MongoDB) / table (SQL) rendered as a node on the canvas. */
export interface CollectionNode {
  id: string;
  name: string;
  /** Lucide icon name or indicator. */
  icon: string;
  /** Header accent color, e.g. `'#afc6ff'`. */
  colorTag: string;
  /** Top-left corner in canvas coordinates. */
  position: XYPosition;
  /** Ordered field list; order is preserved in generated code. */
  fields: SchemaField[];
  description?: string;
  /** Auto-manage `createdAt` / `updatedAt`. */
  timestamps?: boolean;
  compoundIndexes?: CompoundIndex[];
}

/** Convenience alias for code that prefers domain naming over canvas naming. */
export type Collection = CollectionNode;

// ---------------------------------------------------------------------------
// Relationships (derived)
// ---------------------------------------------------------------------------

/**
 * Edge-shaped view of a foreign key. `source*` is the referencing (child) side
 * and `target*` is the referenced (parent) side, matching {@link ForeignKeyRef}.
 *
 * The `id` is deterministic (`rel_<sourceFieldId>`) because a field can hold at
 * most one reference.
 */
export interface Relationship {
  id: string;
  sourceCollectionId: string;
  sourceFieldId: string;
  targetCollectionId: string;
  targetFieldId: string;
  type: RelationshipType;
}

/** @deprecated Use {@link Relationship}. */
export type RelationshipConnection = Relationship;

/** Input for creating a relationship; `type` defaults to `'one-to-many'`. */
export type RelationshipInput = Omit<Relationship, 'id' | 'type'> & { type?: RelationshipType };

// ---------------------------------------------------------------------------
// Canvas
// ---------------------------------------------------------------------------

/** React Flow viewport transform. */
export interface CanvasViewport {
  x: number;
  y: number;
  zoom: number;
}

/** Current selection on the canvas / inspector. */
export interface SelectionState {
  selectedCollectionId: string | null;
  selectedFieldId: string | null;
}

// ---------------------------------------------------------------------------
// Auditing
// ---------------------------------------------------------------------------

export type AuditSeverity = 'info' | 'warning' | 'error';

/** Stable identifiers for audit rules so the UI can filter / suppress them. */
export type AuditCode =
  | 'missing-primary-key'
  | 'duplicate-field-name'
  | 'duplicate-collection-name'
  | 'dangling-reference'
  | 'reference-type-mismatch'
  | 'unindexed-foreign-key'
  | 'ttl-on-non-date'
  | 'empty-collection'
  | 'invalid-identifier';

/** A single finding produced by a schema audit. */
export interface AuditWarning {
  id: string;
  code: AuditCode;
  severity: AuditSeverity;
  message: string;
  collectionId?: string;
  fieldId?: string;
  /** Optional remediation hint shown under the message. */
  suggestion?: string;
}

// ---------------------------------------------------------------------------
// Project
// ---------------------------------------------------------------------------

export interface ProjectMetadata {
  name: string;
  ormVersion: string;
  framework: TargetFramework;
}

/** Built-in starter templates that `loadTemplate` accepts. */
export type TemplateId = 'saas' | 'ecommerce' | 'chat' | 'lms' | 'blog' | 'empty';
