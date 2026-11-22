import { describe, it, expect, beforeEach } from 'vitest';
import {
  buildDefaultEndpoints,
  checkEndpointIndexAlignment,
  checkQueryIndexAlignment,
  findOwnerField,
  generateApiRouterCode,
  generateMiddlewareDeclarations,
  pluralRouteSegment,
} from '../apiCodeGenerator';
import { applyAutoFix } from '../schemaAutoFix';
import { auditSchema } from '../schemaAuditor';
import { useSchemaStore } from '../../store/useSchemaStore';
import type { ApiEndpoint, CollectionNode } from '../../types';

describe('API Route & Middleware Code Generator Engine', () => {
  const sampleUsersCol: CollectionNode = {
    id: 'col_users',
    name: 'Users',
    icon: 'Users',
    colorTag: '#6366F1',
    position: { x: 50, y: 100 },
    timestamps: true,
    fields: [
      { id: 'f_u_1', name: '_id', type: 'ObjectId', isPrimaryKey: true, validation: { required: true } },
      { id: 'f_u_2', name: 'email', type: 'String', validation: { required: true, unique: true } },
      { id: 'f_u_3', name: 'role', type: 'Enum', validation: { defaultVal: "'user'", enumOptions: ['admin', 'user', 'guest'] } },
      { id: 'f_u_4', name: 'age', type: 'Number', validation: { min: 18, max: 120 } },
      { id: 'f_u_5', name: 'createdAt', type: 'Date', validation: { defaultVal: 'Date.now' } },
    ],
  };

  const samplePostsCol: CollectionNode = {
    id: 'col_posts',
    name: 'Posts',
    icon: 'FileText',
    colorTag: '#10B981',
    position: { x: 450, y: 100 },
    timestamps: true,
    fields: [
      { id: 'f_p_1', name: '_id', type: 'ObjectId', isPrimaryKey: true, validation: { required: true } },
      { id: 'f_p_2', name: 'title', type: 'String', validation: { required: true, min: 3, max: 100 } },
      {
        id: 'f_p_3',
        name: 'authorId',
        type: 'ObjectId',
        isForeignKey: true,
        foreignKeyRef: { targetCollectionId: 'col_users', targetFieldId: 'f_u_1', relationType: 'one-to-many' },
        validation: { required: true },
      },
      { id: 'f_p_4', name: 'slug', type: 'String', validation: { required: true, unique: true } },
      { id: 'f_p_5', name: 'tags', type: 'Array', array: { itemType: 'String' }, validation: { required: false } },
    ],
  };

  describe('Route & Middleware Helpers', () => {
    it('generates clean plural route segments', () => {
      expect(pluralRouteSegment('Users')).toBe('users');
      expect(pluralRouteSegment('Post')).toBe('posts');
      expect(pluralRouteSegment('Order Items')).toBe('order-items');
      expect(pluralRouteSegment('Category')).toBe('categories');
    });

    it('identifies owner field candidates correctly', () => {
      expect(findOwnerField(samplePostsCol.fields)).toBe('authorId');
      expect(findOwnerField(sampleUsersCol.fields)).toBeUndefined();
    });
  });

  describe('buildDefaultEndpoints', () => {
    it('creates 5 standard CRUD endpoints tailored to the collection', () => {
      const endpoints = buildDefaultEndpoints(samplePostsCol);
      expect(endpoints).toHaveLength(5);

      const methods = endpoints.map((e) => e.method);
      expect(methods).toEqual(['GET', 'GET', 'POST', 'PATCH', 'DELETE']);

      // Check paths
      expect(endpoints[0].path).toBe('/api/posts');
      expect(endpoints[1].path).toBe('/api/posts/:id');
      expect(endpoints[2].path).toBe('/api/posts');
      expect(endpoints[3].path).toBe('/api/posts/:id');
      expect(endpoints[4].path).toBe('/api/posts/:id');

      // Check query fields include foreign keys and unique fields
      expect(endpoints[0].queryFields).toContain('page');
      expect(endpoints[0].queryFields).toContain('limit');
      expect(endpoints[0].queryFields).toContain('authorId');
      expect(endpoints[0].queryFields).toContain('slug');

      // Check ownership middleware is configured on PATCH because authorId exists
      const patchEp = endpoints[3];
      const ownershipStep = patchEp.middlewares.find((m) => m.kind === 'ownership');
      expect(ownershipStep).toBeDefined();
      expect(ownershipStep?.enabled).toBe(true);
      expect(ownershipStep?.config?.ownerField).toBe('authorId');

      // Check RBAC admin role on DELETE
      const deleteEp = endpoints[4];
      const rbacStep = deleteEp.middlewares.find((m) => m.kind === 'rbac');
      expect(rbacStep).toBeDefined();
      expect(rbacStep?.enabled).toBe(true);
      expect(rbacStep?.config?.roles).toEqual(['admin']);
    });
  });

  describe('generateMiddlewareDeclarations', () => {
    it('emits all 6 production Express middlewares', () => {
      const code = generateMiddlewareDeclarations();

      expect(code).toContain('export function createRateLimiter');
      expect(code).toContain('export function requireAuth');
      expect(code).toContain('export function requireRole');
      expect(code).toContain('export function validateRequest');
      expect(code).toContain('export function requireOwnership');
      expect(code).toContain('export function auditAction');

      // Status codes embedded in middleware
      expect(code).toContain('429');
      expect(code).toContain('401');
      expect(code).toContain('403');
      expect(code).toContain('400');
    });
  });

  describe('generateApiRouterCode', () => {
    it('generates fully wired Express router with status codes, error forwarding, and Zod validation', () => {
      const endpoints = [
        ...buildDefaultEndpoints(sampleUsersCol),
        ...buildDefaultEndpoints(samplePostsCol),
      ];

      const code = generateApiRouterCode(endpoints, [sampleUsersCol, samplePostsCol]);

      // Imports and setup
      expect(code).toContain("import { Router, Request, Response, NextFunction } from 'express';");
      expect(code).toContain("import { z } from 'zod';");

      // Zod Schemas
      expect(code).toContain('export const CreateUserSchema = z.object({');
      expect(code).toContain('export const UpdateUserSchema = CreateUserSchema.partial();');
      expect(code).toContain('export const QueryUserSchema = z.object({');
      expect(code).toContain('export const CreatePostSchema = z.object({');

      // Routers
      expect(code).toContain('export const userRouter = Router();');
      expect(code).toContain('export const postRouter = Router();');

      // Middleware chain wiring
      expect(code).toContain("userRouter.get('/', createRateLimiter({ rpm: 100 }), async (req: Request, res: Response, next: NextFunction): Promise<void> =>");
      expect(code).toContain("userRouter.post('/', requireAuth(), validateRequest(CreateUserSchema), async (req: Request, res: Response, next: NextFunction): Promise<void> =>");
      expect(code).toContain("postRouter.patch('/:id', requireAuth(), validateRequest(UpdatePostSchema), requireOwnership('authorId'), async (req: Request, res: Response, next: NextFunction): Promise<void> =>");
      expect(code).toContain("postRouter.delete('/:id', requireAuth(), requireRole(['admin']), async (req: Request, res: Response, next: NextFunction): Promise<void> =>");

      // Status codes
      expect(code).toContain('res.status(200).json(');
      expect(code).toContain('res.status(201).json(');
      expect(code).toContain('res.status(400).json(');
      expect(code).toContain('res.status(409).json(');

      // Error forwarding
      expect(code).toContain('next(err);');
    });
  });

  describe('Zustand Store Endpoints & Middleware Actions', () => {
    beforeEach(() => {
      useSchemaStore.setState({
        collections: [sampleUsersCol, samplePostsCol],
        endpoints: [],
        selectedEndpointId: null,
      });
    });

    it('generates default endpoints for collection and selects the first one', () => {
      useSchemaStore.getState().generateDefaultEndpointsForCollection('col_posts');

      const state = useSchemaStore.getState();
      expect(state.endpoints).toHaveLength(5);
      expect(state.selectedEndpointId).toBe(state.endpoints[0].id);
      expect(state.endpoints[0].collectionId).toBe('col_posts');
    });

    it('adds, updates, and deletes endpoints', () => {
      const id = useSchemaStore.getState().addEndpoint({
        collectionId: 'col_users',
        method: 'GET',
        path: '/api/users/stats',
        summary: 'Get user statistics',
        middlewares: [],
      });

      expect(useSchemaStore.getState().endpoints).toHaveLength(1);
      expect(useSchemaStore.getState().selectedEndpointId).toBe(id);

      useSchemaStore.getState().updateEndpoint(id, { summary: 'Updated summary' });
      expect(useSchemaStore.getState().endpoints[0].summary).toBe('Updated summary');

      useSchemaStore.getState().deleteEndpoint(id);
      expect(useSchemaStore.getState().endpoints).toHaveLength(0);
      expect(useSchemaStore.getState().selectedEndpointId).toBeNull();
    });

    it('adds, updates, reorders, and removes middleware steps', () => {
      const epId = useSchemaStore.getState().addEndpoint({
        collectionId: 'col_users',
        method: 'POST',
        path: '/api/users',
        summary: 'Create user',
        middlewares: [],
      });

      const mw1 = useSchemaStore.getState().addMiddlewareStep(epId, {
        kind: 'auth',
        enabled: true,
      });
      const mw2 = useSchemaStore.getState().addMiddlewareStep(epId, {
        kind: 'rateLimit',
        enabled: true,
        config: { rpm: 30 },
      });

      let ep = useSchemaStore.getState().endpoints.find((e) => e.id === epId)!;
      expect(ep.middlewares).toHaveLength(2);
      expect(ep.middlewares[0].kind).toBe('auth');
      expect(ep.middlewares[1].kind).toBe('rateLimit');

      // Update middleware step
      useSchemaStore.getState().updateMiddlewareStep(epId, mw2!, { config: { rpm: 50 } });
      ep = useSchemaStore.getState().endpoints.find((e) => e.id === epId)!;
      expect(ep.middlewares[1].config?.rpm).toBe(50);

      // Reorder middleware steps
      useSchemaStore.getState().reorderMiddlewareSteps(epId, 0, 1);
      ep = useSchemaStore.getState().endpoints.find((e) => e.id === epId)!;
      expect(ep.middlewares[0].kind).toBe('rateLimit');
      expect(ep.middlewares[1].kind).toBe('auth');

      // Remove middleware step
      useSchemaStore.getState().removeMiddlewareStep(epId, mw1!);
      ep = useSchemaStore.getState().endpoints.find((e) => e.id === epId)!;
      expect(ep.middlewares).toHaveLength(1);
      expect(ep.middlewares[0].kind).toBe('rateLimit');
    });
  });

  describe('Query-to-Index Alignment & Auto-Fix', () => {
    it('flags unindexed query/filter fields and path parameters', () => {
      // Users collection has 'age', which is not indexed or unique
      const testEndpoint: ApiEndpoint = {
        id: 'ep_users_filter_age',
        collectionId: 'col_users',
        method: 'GET',
        path: '/api/users',
        summary: 'Filter users by age',
        queryFields: ['page', 'limit', 'age'],
        middlewares: [],
      };

      const issues = checkQueryIndexAlignment([testEndpoint], [sampleUsersCol]);
      expect(issues).toHaveLength(1);
      expect(issues[0].ruleCode).toBe('UNINDEXED_QUERY_FIELD');
      expect(issues[0].fieldId).toBe('f_u_4');
      expect(issues[0].canAutoFix).toBe(true);
      expect(issues[0].fixLabel).toContain('age');
    });

    it('does not flag indexed, unique, or primary key query fields', () => {
      // slug is unique, authorId has indexed: true, _id is primary key
      const postsColWithIndex: CollectionNode = {
        ...samplePostsCol,
        fields: samplePostsCol.fields.map((f) =>
          f.name === 'authorId' ? { ...f, index: { indexed: true } } : f,
        ),
      };

      const testEndpoint: ApiEndpoint = {
        id: 'ep_posts_filter_author',
        collectionId: 'col_posts',
        method: 'GET',
        path: '/api/posts/:id',
        summary: 'Get post by ID and filter author',
        queryFields: ['page', 'limit', 'authorId', 'slug'],
        middlewares: [],
      };

      const issues = checkEndpointIndexAlignment([testEndpoint], [postsColWithIndex]);
      expect(issues).toHaveLength(0);
    });

    it('successfully auto-fixes UNINDEXED_QUERY_FIELD by adding secondary index', () => {
      const testEndpoint: ApiEndpoint = {
        id: 'ep_users_filter_age',
        collectionId: 'col_users',
        method: 'GET',
        path: '/api/users',
        summary: 'Filter users by age',
        queryFields: ['age'],
        middlewares: [],
      };

      const issues = checkEndpointIndexAlignment([testEndpoint], [sampleUsersCol]);
      expect(issues).toHaveLength(1);

      const fixResult = applyAutoFix(issues[0], [sampleUsersCol]);
      const fixedCol = fixResult.nextCollections.find((c) => c.id === 'col_users')!;
      const fixedField = fixedCol.fields.find((f) => f.id === 'f_u_4')!;

      expect(fixedField.index?.indexed).toBe(true);
      expect(fixResult.summary).toContain('Added secondary index to query field "age"');

      // Re-auditing with fixed collection leaves 0 issues
      const cleanIssues = checkEndpointIndexAlignment([testEndpoint], [fixedCol]);
      expect(cleanIssues).toHaveLength(0);
    });

    it('integrates query-to-index checks into auditSchema', () => {
      const unindexedEp: ApiEndpoint = {
        id: 'ep_users_unindexed',
        collectionId: 'col_users',
        method: 'GET',
        path: '/api/users',
        summary: 'Query by age',
        queryFields: ['age'],
        middlewares: [],
      };

      const auditResult = auditSchema([sampleUsersCol], [unindexedEp]);
      const unindexedIssue = auditResult.issues.find((i) => i.ruleCode === 'UNINDEXED_QUERY_FIELD');
      expect(unindexedIssue).toBeDefined();
      expect(unindexedIssue?.fieldId).toBe('f_u_4');
    });
  });
});
