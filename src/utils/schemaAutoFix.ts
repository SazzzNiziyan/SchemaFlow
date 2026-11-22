import type { CollectionNode, SchemaField } from '../types';
import type { AuditIssue } from './schemaAuditor';
import { createId } from './schemaOps';
import { layoutCollections } from './autoLayout';
import { useSchemaStore } from '../store/useSchemaStore';
import { useUIStore } from '../store/useUIStore';

export interface AutoFixResult {
  nextCollections: CollectionNode[];
  requiresLayout: boolean;
  summary: string;
}

/**
 * Extracts an unbounded array field into its own child collection with an indexed
 * parent foreign key and re-runs auto-layout so it sits cleanly on the canvas.
 */
function extractUnboundedArrayFix(
  parentCol: CollectionNode,
  fieldId: string,
  allCols: CollectionNode[],
): CollectionNode[] {
  const arrayField = parentCol.fields.find((f) => f.id === fieldId);
  if (!arrayField) return allCols;

  // Derive child collection name (e.g. comments -> Comments)
  let baseName = arrayField.name
    .replace(/s$/i, '')
    .replace(/list$/i, '')
    .replace(/items?$/i, '');
  if (!baseName) baseName = 'Item';
  let childName = baseName.charAt(0).toUpperCase() + baseName.slice(1) + 's';

  // Avoid name collisions
  if (allCols.some((c) => c.name.toLowerCase() === childName.toLowerCase())) {
    childName = `${parentCol.name}${childName}`;
  }

  const parentPk = parentCol.fields.find((f) => f.isPrimaryKey) ?? parentCol.fields[0];
  const parentFkName = `${parentCol.name.charAt(0).toLowerCase() + parentCol.name.slice(1).replace(/s$/i, '')}Id`;

  // Child Primary Key
  const childPk: SchemaField = {
    id: createId('f'),
    name: '_id',
    type: 'ObjectId',
    isPrimaryKey: true,
    validation: { required: true },
  };

  // Foreign Key linking back to parent collection (with secondary index)
  const parentFk: SchemaField = {
    id: createId('f'),
    name: parentFkName,
    type: parentPk ? parentPk.type : 'ObjectId',
    isForeignKey: true,
    foreignKeyRef: {
      targetCollectionId: parentCol.id,
      targetFieldId: parentPk ? parentPk.id : 'f_pk',
      relationType: 'one-to-many',
    },
    index: {
      indexed: true,
      direction: 1,
    },
    validation: { required: true },
  };

  // Payload content field
  const itemType = arrayField.array?.itemType;
  const payloadField: SchemaField = {
    id: createId('f'),
    name: 'content',
    type: itemType && itemType !== 'ObjectId' ? itemType : 'String',
    validation: { required: false },
  };

  const createdAtField: SchemaField = {
    id: createId('f'),
    name: 'createdAt',
    type: 'Date',
    validation: { defaultVal: 'Date.now' },
  };

  const newChildCollection: CollectionNode = {
    id: createId('col'),
    name: childName,
    icon: 'Database',
    colorTag: '#6366F1',
    position: { x: (parentCol.position?.x ?? 50) + 396, y: parentCol.position?.y ?? 50 },
    timestamps: true,
    fields: [childPk, parentFk, payloadField, createdAtField],
  };

  // Remove the unbounded array from the parent collection
  const updatedParent: CollectionNode = {
    ...parentCol,
    fields: parentCol.fields.filter((f) => f.id !== fieldId),
  };

  const nextCols = allCols.map((c) => (c.id === parentCol.id ? updatedParent : c));
  nextCols.push(newChildCollection);

  return layoutCollections(nextCols);
}

/**
 * Pure 1-Click Auto-Fix generator.
 * Returns the updated collections array and whether a layout pass was required.
 */
export function applyAutoFix(issue: AuditIssue, collections: CollectionNode[]): AutoFixResult {
  const targetCol = collections.find((c) => c.id === issue.collectionId);
  if (!targetCol) {
    return { nextCollections: collections, requiresLayout: false, summary: 'Collection not found' };
  }

  switch (issue.ruleCode) {
    case 'UNBOUNDED_ARRAY': {
      if (!issue.fieldId) {
        return { nextCollections: collections, requiresLayout: false, summary: 'Field id missing' };
      }
      const nextCollections = extractUnboundedArrayFix(targetCol, issue.fieldId, collections);
      return {
        nextCollections,
        requiresLayout: true,
        summary: `Extracted "${targetCol.fields.find((f) => f.id === issue.fieldId)?.name}" into linked child collection`,
      };
    }

    case 'MISSING_FK_INDEX': {
      const nextCollections = collections.map((col) => {
        if (col.id !== issue.collectionId) return col;
        return {
          ...col,
          fields: col.fields.map((f) => {
            if (f.id !== issue.fieldId) return f;
            return {
              ...f,
              index: {
                ...(f.index ?? { indexed: true }),
                indexed: true,
                direction: f.index?.direction ?? 1,
              },
            };
          }),
        };
      });
      return {
        nextCollections,
        requiresLayout: false,
        summary: `Added secondary index to foreign key`,
      };
    }

    case 'MISSING_UNIQUE_INDEX': {
      const nextCollections = collections.map((col) => {
        if (col.id !== issue.collectionId) return col;
        return {
          ...col,
          fields: col.fields.map((f) => {
            if (f.id !== issue.fieldId) return f;
            return {
              ...f,
              validation: {
                ...f.validation,
                unique: true,
              },
            };
          }),
        };
      });
      return {
        nextCollections,
        requiresLayout: false,
        summary: `Enabled unique constraint on field`,
      };
    }

    case 'MISSING_TIMESTAMPS': {
      const nextCollections = collections.map((col) => {
        if (col.id !== issue.collectionId) return col;
        const hasCreatedAt = col.fields.some((f) => /^(created_?at)$/i.test(f.name));
        const updatedFields = [...col.fields];
        if (!hasCreatedAt) {
          updatedFields.push({
            id: createId('f'),
            name: 'createdAt',
            type: 'Date',
            validation: { defaultVal: 'Date.now' },
          });
        }
        return {
          ...col,
          timestamps: true,
          fields: updatedFields,
        };
      });
      return {
        nextCollections,
        requiresLayout: false,
        summary: `Enabled timestamps on "${targetCol.name}"`,
      };
    }

    case 'MISSING_TTL_INDEX': {
      const isShortLived = /session|token|otp/i.test(targetCol.name);
      const ttlSeconds = isShortLived ? 86400 : 2592000; // 24h or 30 days

      const nextCollections = collections.map((col) => {
        if (col.id !== issue.collectionId) return col;
        return {
          ...col,
          fields: col.fields.map((f) => {
            if (f.id !== issue.fieldId) return f;
            return {
              ...f,
              index: {
                ...(f.index ?? {}),
                indexed: true,
                ttlSeconds,
              },
            };
          }),
        };
      });
      return {
        nextCollections,
        requiresLayout: false,
        summary: `Added ${isShortLived ? '24-hour' : '30-day'} TTL expiration index`,
      };
    }

    case 'SENSITIVE_FIELD_EXPOSED': {
      const nextCollections = collections.map((col) => {
        if (col.id !== issue.collectionId) return col;
        return {
          ...col,
          fields: col.fields.map((f) => {
            if (f.id !== issue.fieldId) return f;
            return {
              ...f,
              validation: {
                ...f.validation,
                select: false,
              },
            };
          }),
        };
      });
      return {
        nextCollections,
        requiresLayout: false,
        summary: `Set "select: false" on sensitive field`,
      };
    }

    case 'UNINDEXED_QUERY_FIELD': {
      const nextCollections = collections.map((col) => {
        if (col.id !== issue.collectionId) return col;
        return {
          ...col,
          fields: col.fields.map((f) => {
            if (f.id !== issue.fieldId) return f;
            return {
              ...f,
              index: {
                ...(f.index ?? {}),
                indexed: true,
                direction: f.index?.direction ?? 1,
              },
            };
          }),
        };
      });
      const fieldName = targetCol.fields.find((f) => f.id === issue.fieldId)?.name ?? 'field';
      return {
        nextCollections,
        requiresLayout: false,
        summary: `Added secondary index to query field "${fieldName}"`,
      };
    }

    default:
      return { nextCollections: collections, requiresLayout: false, summary: 'No auto-fix available' };
  }
}

/**
 * Executes a 1-Click Fix against the Zustand schema store.
 * Updates the store as a single atomic mutation so Cmd+Z reverses it in one step.
 */
export function executeAutoFix(issue: AuditIssue): boolean {
  if (!issue.canAutoFix) return false;

  const currentCollections = useSchemaStore.getState().collections;
  const result = applyAutoFix(issue, currentCollections);

  if (result.requiresLayout) {
    useUIStore.setState({ animateNextLayout: true });
  }

  useSchemaStore.getState().replaceCollections(result.nextCollections);
  return true;
}

/**
 * Batches and executes all auto-fixable issues in one single undo step.
 */
export function executeFixAll(issues: AuditIssue[]): number {
  const fixable = issues.filter((i) => i.canAutoFix);
  if (fixable.length === 0) return 0;

  let currentCollections = useSchemaStore.getState().collections;
  let anyRequiresLayout = false;

  for (const issue of fixable) {
    const res = applyAutoFix(issue, currentCollections);
    currentCollections = res.nextCollections;
    if (res.requiresLayout) anyRequiresLayout = true;
  }

  if (anyRequiresLayout) {
    currentCollections = layoutCollections(currentCollections);
    useUIStore.setState({ animateNextLayout: true });
  }

  useSchemaStore.getState().replaceCollections(currentCollections);
  return fixable.length;
}
