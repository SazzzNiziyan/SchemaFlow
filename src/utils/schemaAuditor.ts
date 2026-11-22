import { useMemo } from 'react';
import type { ApiEndpoint, CollectionNode, SchemaField } from '../types';
import { useSchemaStore } from '../store/useSchemaStore';
import { checkEndpointIndexAlignment } from './apiCodeGenerator';

export type AuditSeverity = 'critical' | 'warning' | 'info';

export type AuditRuleCode =
  | 'UNBOUNDED_ARRAY'
  | 'MISSING_FK_INDEX'
  | 'MISSING_TIMESTAMPS'
  | 'MISSING_TTL_INDEX'
  | 'MISSING_UNIQUE_INDEX'
  | 'SENSITIVE_FIELD_EXPOSED'
  | 'DEEP_NESTING'
  | 'ORPHAN_COLLECTION'
  | 'UNINDEXED_QUERY_FIELD';

export interface AuditIssue {
  id: string;
  severity: AuditSeverity;
  collectionId: string;
  fieldId?: string;
  ruleCode: AuditRuleCode;
  title: string;
  explanation: string;
  mongoImpact: string;
  canAutoFix: boolean;
  fixLabel: string;
}

export interface SchemaAuditResult {
  score: number;
  issues: AuditIssue[];
  criticalCount: number;
  warningCount: number;
  infoCount: number;
  collectionIssueMap: Map<string, AuditIssue[]>;
  fieldIssueMap: Map<string, AuditIssue[]>;
}

const UNBOUNDED_ARRAY_NAME_REGEX =
  /^(comments?|logs?|orders?|messages?|notifications?|items?|events?|transactions?|history|activities|auditlogs?|attachments?|sessions?)$/i;

const TRANSIENT_COLLECTION_REGEX =
  /^(logs?|sessions?|tokens?|otps?|events?|caches?|audits?|notifications?)$/i;

const UNIQUE_CANDIDATE_REGEX =
  /^(email|username|slug|sku|handle|uuid|phone|phonenumber|nationalid|ssn)$/i;

const SENSITIVE_FIELD_REGEX =
  /^(password|passwordhash|password_hash|secret|refreshtoken|refresh_token|apikey|api_key|token|accesstoken|access_token|privatekey|private_key|authsecret)$/i;

/** Recursively measures the nesting depth of embedded fields. */
function measureFieldNestingDepth(field: SchemaField, currentDepth = 1): number {
  if (!field.nested?.fields || field.nested.fields.length === 0) {
    return currentDepth;
  }
  let maxChildDepth = currentDepth;
  for (const child of field.nested.fields) {
    const childDepth = measureFieldNestingDepth(child, currentDepth + 1);
    if (childDepth > maxChildDepth) {
      maxChildDepth = childDepth;
    }
  }
  return maxChildDepth;
}

/**
 * Calculates a 0–100 Schema Health Score based on issue severity deductions:
 * - Critical: -15 pts
 * - Warning: -5 pts
 * - Info: -1 pt
 */
export function calculateHealthScore(issues: AuditIssue[], collectionCount: number): number {
  if (collectionCount === 0) return 100;
  let penalty = 0;
  for (const issue of issues) {
    if (issue.severity === 'critical') penalty += 15;
    else if (issue.severity === 'warning') penalty += 5;
    else if (issue.severity === 'info') penalty += 1;
  }
  return Math.max(0, Math.min(100, Math.round(100 - penalty)));
}

/**
 * Pure, dependency-free MongoDB Schema Anti-Pattern & Index Auditor.
 * Evaluates real MongoDB engineering rules across collections, fields, and API routes.
 */
export function auditSchema(collections: CollectionNode[], endpoints?: ApiEndpoint[]): SchemaAuditResult {
  const issues: AuditIssue[] = [];
  const collectionIssueMap = new Map<string, AuditIssue[]>();
  const fieldIssueMap = new Map<string, AuditIssue[]>();

  const addIssue = (issue: AuditIssue) => {
    issues.push(issue);

    // Group by collection
    if (!collectionIssueMap.has(issue.collectionId)) {
      collectionIssueMap.set(issue.collectionId, []);
    }
    collectionIssueMap.get(issue.collectionId)!.push(issue);

    // Group by field
    if (issue.fieldId) {
      const key = `${issue.collectionId}:${issue.fieldId}`;
      if (!fieldIssueMap.has(key)) {
        fieldIssueMap.set(key, []);
      }
      fieldIssueMap.get(key)!.push(issue);
    }
  };

  // Build incoming reference map to check for orphan collections
  const referencedCollectionIds = new Set<string>();
  collections.forEach((col) => {
    col.fields.forEach((f) => {
      if (f.isForeignKey && f.foreignKeyRef?.targetCollectionId) {
        referencedCollectionIds.add(f.foreignKeyRef.targetCollectionId);
      }
    });
  });

  collections.forEach((col) => {
    // -------------------------------------------------------------------------
    // Rule: MISSING_TIMESTAMPS
    // -------------------------------------------------------------------------
    const hasTimestampsOption = !!col.timestamps;
    const hasCreatedAtField = col.fields.some((f) => /^(created_?at)$/i.test(f.name));
    const hasUpdatedAtField = col.fields.some((f) => /^(updated_?at)$/i.test(f.name));

    if (!hasTimestampsOption && !hasCreatedAtField && !hasUpdatedAtField) {
      addIssue({
        id: `aud_${col.id}_timestamps`,
        severity: 'warning',
        collectionId: col.id,
        ruleCode: 'MISSING_TIMESTAMPS',
        title: `Collection "${col.name}" lacks timestamps`,
        explanation: `"${col.name}" does not enable Mongoose timestamps or define createdAt/updatedAt fields, preventing time-based cursor pagination, auditability, and sync.`,
        mongoImpact: 'Loss of temporal audit trail; inability to construct performant time-range index queries.',
        canAutoFix: true,
        fixLabel: 'Enable Timestamps',
      });
    }

    // -------------------------------------------------------------------------
    // Rule: MISSING_TTL_INDEX
    // -------------------------------------------------------------------------
    const isTransient =
      TRANSIENT_COLLECTION_REGEX.test(col.name) ||
      /^(.*)(Log|Logs|Session|Sessions|Token|Tokens|Otp|Otps|Event|Events|Cache)$/i.test(col.name);

    if (isTransient) {
      const dateFields = col.fields.filter((f) => f.type === 'Date');
      const hasTtlIndex = dateFields.some((f) => f.index?.indexed && (f.index.ttlSeconds ?? 0) > 0);

      if (dateFields.length > 0 && !hasTtlIndex) {
        // Find the best date field candidate
        const candidateField =
          dateFields.find((f) => /expires?_?at/i.test(f.name)) ??
          dateFields.find((f) => /created_?at/i.test(f.name)) ??
          dateFields[0];

        const isShortLived = /session|token|otp/i.test(col.name);
        const suggestedTtl = isShortLived ? '24h' : '30d';

        addIssue({
          id: `aud_${col.id}_${candidateField.id}_ttl`,
          severity: 'warning',
          collectionId: col.id,
          fieldId: candidateField.id,
          ruleCode: 'MISSING_TTL_INDEX',
          title: `Missing TTL expiration index in "${col.name}"`,
          explanation: `Transient collection "${col.name}" accumulates records indefinitely without automatic TTL expiration on "${candidateField.name}".`,
          mongoImpact: 'Unbounded disk storage bloat and slow index scans due to accumulated stale documents.',
          canAutoFix: true,
          fixLabel: `Add ${suggestedTtl} TTL Index`,
        });
      }
    }

    // -------------------------------------------------------------------------
    // Rule: ORPHAN_COLLECTION
    // -------------------------------------------------------------------------
    if (collections.length > 1) {
      const hasOutgoingRefs = col.fields.some((f) => f.isForeignKey && f.foreignKeyRef?.targetCollectionId);
      const hasIncomingRefs = referencedCollectionIds.has(col.id);

      if (!hasOutgoingRefs && !hasIncomingRefs) {
        addIssue({
          id: `aud_${col.id}_orphan`,
          severity: 'info',
          collectionId: col.id,
          ruleCode: 'ORPHAN_COLLECTION',
          title: `Isolated collection "${col.name}" has no relationships`,
          explanation: `"${col.name}" has no foreign keys to or from other collections in this schema. Verify if it should link to a parent model.`,
          mongoImpact: 'Informational architecture finding; relational joins via $lookup are not modeled.',
          canAutoFix: false,
          fixLabel: 'Review Relations',
        });
      }
    }

    // -------------------------------------------------------------------------
    // Field-level rules
    // -------------------------------------------------------------------------
    col.fields.forEach((field) => {
      // -----------------------------------------------------------------------
      // Rule: UNBOUNDED_ARRAY
      // -----------------------------------------------------------------------
      if (field.type === 'Array') {
        const isRefArray = field.array?.itemType === 'ObjectId' || field.name.toLowerCase().endsWith('ids');
        const isSubdocArray = field.array?.itemType === 'JSON' || !!field.nested?.fields?.length;
        const isSuspectName = UNBOUNDED_ARRAY_NAME_REGEX.test(field.name);
        const hasHighOrNoLimit = !field.array?.maxItems || field.array.maxItems > 100;

        if ((isRefArray || isSubdocArray || isSuspectName) && hasHighOrNoLimit) {
          addIssue({
            id: `aud_${col.id}_${field.id}_unbounded`,
            severity: 'critical',
            collectionId: col.id,
            fieldId: field.id,
            ruleCode: 'UNBOUNDED_ARRAY',
            title: `Unbounded Array anti-pattern on "${field.name}"`,
            explanation: `Embedding an unbounded array of references or subdocuments inside "${col.name}" risks breaching MongoDB's strict 16MB document limit and incurs heavy document relocation overhead on disk.`,
            mongoImpact: 'BSON 16MB limit failure, document fragmentation, and index memory thrashing.',
            canAutoFix: true,
            fixLabel: 'Extract to linked collection',
          });
        }
      }

      // -----------------------------------------------------------------------
      // Rule: MISSING_FK_INDEX
      // -----------------------------------------------------------------------
      if ((field.isForeignKey || !!field.foreignKeyRef) && !field.isPrimaryKey) {
        if (!field.index?.indexed) {
          const target = field.foreignKeyRef?.targetCollectionId ?? 'parent collection';
          addIssue({
            id: `aud_${col.id}_${field.id}_fk_idx`,
            severity: 'warning',
            collectionId: col.id,
            fieldId: field.id,
            ruleCode: 'MISSING_FK_INDEX',
            title: `Missing index on foreign key "${field.name}"`,
            explanation: `Foreign key "${field.name}" referencing "${target}" is unindexed. Querying parent-child relations or using $lookup will trigger full collection scans (COLLSCAN).`,
            mongoImpact: 'Full collection scan (COLLSCAN) on every $lookup aggregation join, high CPU latency.',
            canAutoFix: true,
            fixLabel: 'Add Secondary Index',
          });
        }
      }

      // -----------------------------------------------------------------------
      // Rule: MISSING_UNIQUE_INDEX
      // -----------------------------------------------------------------------
      if (UNIQUE_CANDIDATE_REGEX.test(field.name) && !field.isPrimaryKey && !field.validation.unique) {
        const inUniqueCompound = col.compoundIndexes?.some(
          (ci) => ci.unique && ci.fields.some((cf) => cf.fieldId === field.id),
        );
        if (!inUniqueCompound) {
          addIssue({
            id: `aud_${col.id}_${field.id}_uniq`,
            severity: 'warning',
            collectionId: col.id,
            fieldId: field.id,
            ruleCode: 'MISSING_UNIQUE_INDEX',
            title: `Natural identifier "${field.name}" lacks unique index`,
            explanation: `Field "${field.name}" is a natural identifier candidate but is not marked unique. Without a unique constraint, duplicate records can be inserted under concurrent requests.`,
            mongoImpact: 'Duplicate document race conditions and data integrity corruption.',
            canAutoFix: true,
            fixLabel: 'Add Unique Index',
          });
        }
      }

      // -----------------------------------------------------------------------
      // Rule: SENSITIVE_FIELD_EXPOSED
      // -----------------------------------------------------------------------
      if (SENSITIVE_FIELD_REGEX.test(field.name)) {
        if (field.validation.select !== false) {
          addIssue({
            id: `aud_${col.id}_${field.id}_sensitive`,
            severity: 'critical',
            collectionId: col.id,
            fieldId: field.id,
            ruleCode: 'SENSITIVE_FIELD_EXPOSED',
            title: `Sensitive credential "${field.name}" exposed by default`,
            explanation: `"${field.name}" holds cryptographic secrets or credentials. Without "select: false", standard Mongoose/MongoDB find() queries will serialize it to API clients by default.`,
            mongoImpact: 'Critical credential exposure in API response payloads and application log outputs.',
            canAutoFix: true,
            fixLabel: 'Set select: false',
          });
        }
      }

      // -----------------------------------------------------------------------
      // Rule: DEEP_NESTING
      // -----------------------------------------------------------------------
      const nestingDepth = measureFieldNestingDepth(field);
      if (nestingDepth > 3) {
        addIssue({
          id: `aud_${col.id}_${field.id}_nesting`,
          severity: 'warning',
          collectionId: col.id,
          fieldId: field.id,
          ruleCode: 'DEEP_NESTING',
          title: `Deeply nested structure on "${field.name}" (${nestingDepth} levels)`,
          explanation: `Subdocument nesting depth of ${nestingDepth} levels hurts update performance with atomic operators ($set, $push) and degrades aggregation query maintainability.`,
          mongoImpact: 'High update write amplification and complex multi-stage $unwind aggregation pipelines.',
          canAutoFix: false,
          fixLabel: 'Flatten Schema',
        });
      }
    });
  });

  // ---------------------------------------------------------------------------
  // Query-to-Index Alignment Checks
  // ---------------------------------------------------------------------------
  if (endpoints && endpoints.length > 0) {
    const routeIndexIssues = checkEndpointIndexAlignment(endpoints, collections);
    routeIndexIssues.forEach(addIssue);
  }

  const score = calculateHealthScore(issues, collections.length);
  const criticalCount = issues.filter((i) => i.severity === 'critical').length;
  const warningCount = issues.filter((i) => i.severity === 'warning').length;
  const infoCount = issues.filter((i) => i.severity === 'info').length;

  return {
    score,
    issues,
    criticalCount,
    warningCount,
    infoCount,
    collectionIssueMap,
    fieldIssueMap,
  };
}

/**
 * Reactive hook that re-computes the Schema Audit result on any collection or endpoint change.
 */
export function useSchemaAudit(): SchemaAuditResult {
  const collections = useSchemaStore((s) => s.collections);
  const endpoints = useSchemaStore((s) => s.endpoints);
  return useMemo(() => auditSchema(collections, endpoints), [collections, endpoints]);
}
