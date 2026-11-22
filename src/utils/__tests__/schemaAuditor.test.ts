import { describe, it, expect } from 'vitest';
import { auditSchema } from '../schemaAuditor';
import { applyAutoFix } from '../schemaAutoFix';
import type { CollectionNode } from '../../types';

const mockCol = (col: Partial<CollectionNode> & { id: string; name: string; fields: CollectionNode['fields'] }): CollectionNode => ({
  icon: 'Database',
  colorTag: '#6366F1',
  position: { x: 50, y: 100 },
  ...col,
});

describe('Schema Auditor Engine', () => {
  it('awards a 100% health score to a clean, well-indexed schema', () => {
    const cleanSchema: CollectionNode[] = [
      mockCol({
        id: 'col_users',
        name: 'Users',
        timestamps: true,
        fields: [
          { id: 'f_u_1', name: '_id', type: 'ObjectId', isPrimaryKey: true, validation: { required: true } },
          { id: 'f_u_2', name: 'email', type: 'String', validation: { required: true, unique: true } },
          { id: 'f_u_3', name: 'passwordHash', type: 'String', validation: { required: true, select: false } },
          { id: 'f_u_4', name: 'createdAt', type: 'Date', validation: { defaultVal: 'Date.now' } },
        ],
      }),
      mockCol({
        id: 'col_posts',
        name: 'Posts',
        timestamps: true,
        fields: [
          { id: 'f_p_1', name: '_id', type: 'ObjectId', isPrimaryKey: true, validation: { required: true } },
          {
            id: 'f_p_2',
            name: 'authorId',
            type: 'ObjectId',
            isForeignKey: true,
            foreignKeyRef: { targetCollectionId: 'col_users', targetFieldId: 'f_u_1', relationType: 'one-to-many' },
            index: { indexed: true },
            validation: { required: true },
          },
          { id: 'f_p_3', name: 'title', type: 'String', validation: { required: true } },
          { id: 'f_p_4', name: 'createdAt', type: 'Date', validation: { defaultVal: 'Date.now' } },
        ],
      }),
    ];

    const result = auditSchema(cleanSchema);
    expect(result.score).toBe(100);
    expect(result.criticalCount).toBe(0);
    expect(result.warningCount).toBe(0);
  });

  it('detects UNBOUNDED_ARRAY anti-pattern', () => {
    const schema: CollectionNode[] = [
      mockCol({
        id: 'col_projects',
        name: 'Projects',
        timestamps: true,
        fields: [
          { id: 'f_1', name: '_id', type: 'ObjectId', isPrimaryKey: true, validation: { required: true } },
          { id: 'f_2', name: 'comments', type: 'Array', array: { itemType: 'String' }, validation: { required: false } },
          { id: 'f_3', name: 'createdAt', type: 'Date', validation: { defaultVal: 'Date.now' } },
        ],
      }),
    ];

    const result = auditSchema(schema);
    const unbounded = result.issues.find((i) => i.ruleCode === 'UNBOUNDED_ARRAY');
    expect(unbounded).toBeDefined();
    expect(unbounded?.severity).toBe('critical');
    expect(unbounded?.canAutoFix).toBe(true);
  });

  it('detects MISSING_FK_INDEX on unindexed foreign keys', () => {
    const schema: CollectionNode[] = [
      mockCol({
        id: 'col_users',
        name: 'Users',
        timestamps: true,
        fields: [
          { id: 'f_u_1', name: '_id', type: 'ObjectId', isPrimaryKey: true, validation: { required: true } },
          { id: 'f_u_2', name: 'createdAt', type: 'Date', validation: { defaultVal: 'Date.now' } },
        ],
      }),
      mockCol({
        id: 'col_orders',
        name: 'Orders',
        timestamps: true,
        fields: [
          { id: 'f_o_1', name: '_id', type: 'ObjectId', isPrimaryKey: true, validation: { required: true } },
          {
            id: 'f_o_2',
            name: 'userId',
            type: 'ObjectId',
            isForeignKey: true,
            foreignKeyRef: { targetCollectionId: 'col_users', targetFieldId: 'f_u_1' },
            validation: { required: true },
          },
          { id: 'f_o_3', name: 'createdAt', type: 'Date', validation: { defaultVal: 'Date.now' } },
        ],
      }),
    ];

    const result = auditSchema(schema);
    const missingFk = result.issues.find((i) => i.ruleCode === 'MISSING_FK_INDEX');
    expect(missingFk).toBeDefined();
    expect(missingFk?.severity).toBe('warning');
  });

  it('detects MISSING_TIMESTAMPS when collection has no timestamps', () => {
    const schema: CollectionNode[] = [
      mockCol({
        id: 'col_1',
        name: 'Categories',
        fields: [
          { id: 'f_1', name: '_id', type: 'ObjectId', isPrimaryKey: true, validation: { required: true } },
          { id: 'f_2', name: 'name', type: 'String', validation: { required: true } },
        ],
      }),
    ];

    const result = auditSchema(schema);
    const tsIssue = result.issues.find((i) => i.ruleCode === 'MISSING_TIMESTAMPS');
    expect(tsIssue).toBeDefined();
  });

  it('detects MISSING_TTL_INDEX on transient collections like Sessions or Logs', () => {
    const schema: CollectionNode[] = [
      mockCol({
        id: 'col_sess',
        name: 'UserSessions',
        timestamps: true,
        fields: [
          { id: 'f_s_1', name: '_id', type: 'ObjectId', isPrimaryKey: true, validation: { required: true } },
          { id: 'f_s_2', name: 'expiresAt', type: 'Date', validation: { required: true } },
          { id: 'f_s_3', name: 'createdAt', type: 'Date', validation: { defaultVal: 'Date.now' } },
        ],
      }),
    ];

    const result = auditSchema(schema);
    const ttlIssue = result.issues.find((i) => i.ruleCode === 'MISSING_TTL_INDEX');
    expect(ttlIssue).toBeDefined();
    expect(ttlIssue?.severity).toBe('warning');
  });

  it('detects MISSING_UNIQUE_INDEX on natural identifiers (email, slug, username, sku)', () => {
    const schema: CollectionNode[] = [
      mockCol({
        id: 'col_users',
        name: 'Users',
        timestamps: true,
        fields: [
          { id: 'f_1', name: '_id', type: 'ObjectId', isPrimaryKey: true, validation: { required: true } },
          { id: 'f_2', name: 'email', type: 'String', validation: { required: true, unique: false } },
          { id: 'f_3', name: 'createdAt', type: 'Date', validation: { defaultVal: 'Date.now' } },
        ],
      }),
    ];

    const result = auditSchema(schema);
    const uniqIssue = result.issues.find((i) => i.ruleCode === 'MISSING_UNIQUE_INDEX');
    expect(uniqIssue).toBeDefined();
  });

  it('detects SENSITIVE_FIELD_EXPOSED when passwords or secrets lack select: false', () => {
    const schema: CollectionNode[] = [
      mockCol({
        id: 'col_users',
        name: 'Users',
        timestamps: true,
        fields: [
          { id: 'f_1', name: '_id', type: 'ObjectId', isPrimaryKey: true, validation: { required: true } },
          { id: 'f_2', name: 'password', type: 'String', validation: { required: true } },
          { id: 'f_3', name: 'createdAt', type: 'Date', validation: { defaultVal: 'Date.now' } },
        ],
      }),
    ];

    const result = auditSchema(schema);
    const sensitive = result.issues.find((i) => i.ruleCode === 'SENSITIVE_FIELD_EXPOSED');
    expect(sensitive).toBeDefined();
    expect(sensitive?.severity).toBe('critical');
  });

  it('detects DEEP_NESTING when subdocuments exceed 3 levels', () => {
    const schema: CollectionNode[] = [
      mockCol({
        id: 'col_deep',
        name: 'DeepDocs',
        timestamps: true,
        fields: [
          { id: 'f_1', name: '_id', type: 'ObjectId', isPrimaryKey: true, validation: { required: true } },
          {
            id: 'f_2',
            name: 'level1',
            type: 'JSON',
            validation: { required: false },
            nested: {
              fields: [
                {
                  id: 'f_3',
                  name: 'level2',
                  type: 'JSON',
                  validation: { required: false },
                  nested: {
                    fields: [
                      {
                        id: 'f_4',
                        name: 'level3',
                        type: 'JSON',
                        validation: { required: false },
                        nested: {
                          fields: [
                            { id: 'f_5', name: 'level4', type: 'String', validation: { required: false } },
                          ],
                        },
                      },
                    ],
                  },
                },
              ],
            },
          },
          { id: 'f_6', name: 'createdAt', type: 'Date', validation: { defaultVal: 'Date.now' } },
        ],
      }),
    ];

    const result = auditSchema(schema);
    const deepIssue = result.issues.find((i) => i.ruleCode === 'DEEP_NESTING');
    expect(deepIssue).toBeDefined();
  });

  it('detects ORPHAN_COLLECTION when a collection has zero relationships in a multi-model schema', () => {
    const schema: CollectionNode[] = [
      mockCol({
        id: 'col_1',
        name: 'Users',
        timestamps: true,
        fields: [
          { id: 'f_1', name: '_id', type: 'ObjectId', isPrimaryKey: true, validation: { required: true } },
          { id: 'f_2', name: 'createdAt', type: 'Date', validation: { defaultVal: 'Date.now' } },
        ],
      }),
      mockCol({
        id: 'col_2',
        name: 'Posts',
        timestamps: true,
        fields: [
          { id: 'f_3', name: '_id', type: 'ObjectId', isPrimaryKey: true, validation: { required: true } },
          {
            id: 'f_4',
            name: 'userId',
            type: 'ObjectId',
            isForeignKey: true,
            foreignKeyRef: { targetCollectionId: 'col_1', targetFieldId: 'f_1' },
            index: { indexed: true },
            validation: { required: true },
          },
          { id: 'f_5', name: 'createdAt', type: 'Date', validation: { defaultVal: 'Date.now' } },
        ],
      }),
      mockCol({
        id: 'col_3',
        name: 'StandaloneConfigs',
        timestamps: true,
        fields: [
          { id: 'f_6', name: '_id', type: 'ObjectId', isPrimaryKey: true, validation: { required: true } },
          { id: 'f_7', name: 'key', type: 'String', validation: { required: true } },
          { id: 'f_8', name: 'createdAt', type: 'Date', validation: { defaultVal: 'Date.now' } },
        ],
      }),
    ];

    const result = auditSchema(schema);
    const orphan = result.issues.find((i) => i.ruleCode === 'ORPHAN_COLLECTION');
    expect(orphan).toBeDefined();
    expect(orphan?.collectionId).toBe('col_3');
  });
});

describe('Schema 1-Click Auto-Fixes', () => {
  it('auto-fixes UNBOUNDED_ARRAY by extracting to a new linked child collection', () => {
    const schema: CollectionNode[] = [
      mockCol({
        id: 'col_projects',
        name: 'Projects',
        timestamps: true,
        fields: [
          { id: 'f_p_1', name: '_id', type: 'ObjectId', isPrimaryKey: true, validation: { required: true } },
          { id: 'f_p_2', name: 'name', type: 'String', validation: { required: true } },
          { id: 'f_p_3', name: 'comments', type: 'Array', array: { itemType: 'String' }, validation: { required: false } },
          { id: 'f_p_4', name: 'createdAt', type: 'Date', validation: { defaultVal: 'Date.now' } },
        ],
      }),
    ];

    const initialAudit = auditSchema(schema);
    const issue = initialAudit.issues.find((i) => i.ruleCode === 'UNBOUNDED_ARRAY')!;
    expect(issue).toBeDefined();

    const fixResult = applyAutoFix(issue, schema);
    expect(fixResult.requiresLayout).toBe(true);
    expect(fixResult.nextCollections.length).toBe(2);

    const parent = fixResult.nextCollections.find((c) => c.id === 'col_projects')!;
    expect(parent.fields.some((f) => f.name === 'comments')).toBe(false);

    const child = fixResult.nextCollections.find((c) => c.id !== 'col_projects')!;
    expect(child.name).toBe('Comments');
    const fk = child.fields.find((f) => f.isForeignKey);
    expect(fk).toBeDefined();
    expect(fk?.foreignKeyRef?.targetCollectionId).toBe('col_projects');
    expect(fk?.index?.indexed).toBe(true);

    const fixedAudit = auditSchema(fixResult.nextCollections);
    expect(fixedAudit.issues.some((i) => i.ruleCode === 'UNBOUNDED_ARRAY')).toBe(false);
    expect(fixedAudit.score).toBeGreaterThan(initialAudit.score);
  });

  it('auto-fixes MISSING_FK_INDEX by creating secondary index', () => {
    const schema: CollectionNode[] = [
      mockCol({
        id: 'col_users',
        name: 'Users',
        timestamps: true,
        fields: [
          { id: 'f_u_1', name: '_id', type: 'ObjectId', isPrimaryKey: true, validation: { required: true } },
          { id: 'f_u_2', name: 'createdAt', type: 'Date', validation: { defaultVal: 'Date.now' } },
        ],
      }),
      mockCol({
        id: 'col_orders',
        name: 'Orders',
        timestamps: true,
        fields: [
          { id: 'f_o_1', name: '_id', type: 'ObjectId', isPrimaryKey: true, validation: { required: true } },
          {
            id: 'f_o_2',
            name: 'userId',
            type: 'ObjectId',
            isForeignKey: true,
            foreignKeyRef: { targetCollectionId: 'col_users', targetFieldId: 'f_u_1' },
            validation: { required: true },
          },
          { id: 'f_o_3', name: 'createdAt', type: 'Date', validation: { defaultVal: 'Date.now' } },
        ],
      }),
    ];

    const initialAudit = auditSchema(schema);
    const issue = initialAudit.issues.find((i) => i.ruleCode === 'MISSING_FK_INDEX')!;
    const fixResult = applyAutoFix(issue, schema);

    const fixedCol = fixResult.nextCollections.find((c) => c.id === 'col_orders')!;
    const fkField = fixedCol.fields.find((f) => f.id === 'f_o_2')!;
    expect(fkField.index?.indexed).toBe(true);

    const fixedAudit = auditSchema(fixResult.nextCollections);
    expect(fixedAudit.issues.some((i) => i.ruleCode === 'MISSING_FK_INDEX')).toBe(false);
  });

  it('auto-fixes SENSITIVE_FIELD_EXPOSED by enabling select: false', () => {
    const schema: CollectionNode[] = [
      mockCol({
        id: 'col_users',
        name: 'Users',
        timestamps: true,
        fields: [
          { id: 'f_1', name: '_id', type: 'ObjectId', isPrimaryKey: true, validation: { required: true } },
          { id: 'f_2', name: 'password', type: 'String', validation: { required: true } },
          { id: 'f_3', name: 'createdAt', type: 'Date', validation: { defaultVal: 'Date.now' } },
        ],
      }),
    ];

    const issue = auditSchema(schema).issues.find((i) => i.ruleCode === 'SENSITIVE_FIELD_EXPOSED')!;
    const fixResult = applyAutoFix(issue, schema);
    const pwd = fixResult.nextCollections[0].fields.find((f) => f.name === 'password')!;
    expect(pwd.validation.select).toBe(false);
  });
});
