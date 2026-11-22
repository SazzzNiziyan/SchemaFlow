import { describe, expect, it } from 'vitest';
import type { ApiEndpoint, CollectionNode } from '../../types';
import {
  buildDefaultEndpoints,
  generateCollectionRouterCode,
  generateCollectionZodCode,
  generateMiddlewareChainCode,
  lintMiddlewareChain,
  normalizeRoutePath,
  routeValidatorExpr,
  sortByRecommendedOrder,
} from '../apiCodeGenerator';

const posts: CollectionNode = {
  id: 'col_posts',
  name: 'Posts',
  icon: 'FileText',
  colorTag: '#10B981',
  position: { x: 0, y: 0 },
  timestamps: true,
  fields: [
    { id: 'p1', name: '_id', type: 'ObjectId', isPrimaryKey: true, validation: { required: true } },
    { id: 'p2', name: 'title', type: 'String', validation: { required: true } },
    { id: 'p3', name: 'authorId', type: 'ObjectId', isForeignKey: true, validation: { required: true } },
    { id: 'p4', name: 'status', type: 'String', validation: {} },
    { id: 'p5', name: 'meta', type: 'JSON', validation: {} },
  ],
};

const [list, get, create, update, del] = buildDefaultEndpoints(posts);

describe('lintMiddlewareChain', () => {
  it('accepts the default CRUD chains without warnings', () => {
    for (const ep of [list, get, create, update, del]) {
      expect(lintMiddlewareChain(ep, posts).filter((i) => i.severity === 'warning')).toEqual([]);
    }
  });

  it('flags RBAC placed before auth and RBAC without auth', () => {
    const swapped: ApiEndpoint = {
      ...del,
      middlewares: del.middlewares.map((m) => (m.kind === 'auth' ? { ...m, order: 5 } : m)),
    };
    expect(lintMiddlewareChain(swapped, posts).some((i) => /runs before Auth/.test(i.message))).toBe(true);

    const noAuth: ApiEndpoint = {
      ...del,
      middlewares: del.middlewares.map((m) => (m.kind === 'auth' ? { ...m, enabled: false } : m)),
    };
    const msgs = lintMiddlewareChain(noAuth, posts).map((i) => i.message);
    expect(msgs.some((m) => /needs Auth enabled/.test(m))).toBe(true);
    expect(msgs.some((m) => /publicly writable/.test(m))).toBe(true);
  });

  it('flags unvalidated bodies and missing owner fields', () => {
    const ep: ApiEndpoint = {
      ...update,
      middlewares: [
        { id: 'a', kind: 'auth', enabled: true, order: 0 },
        { id: 'o', kind: 'ownership', enabled: true, order: 1, config: { ownerField: 'ghostId' } },
      ],
    };
    const msgs = lintMiddlewareChain(ep, posts).map((i) => i.message);
    expect(msgs.some((m) => /without Zod validation/.test(m))).toBe(true);
    expect(msgs.some((m) => /"ghostId" does not exist/.test(m))).toBe(true);
  });
});

describe('sortByRecommendedOrder', () => {
  it('orders rateLimit → auth → validateZod → rbac → ownership → auditLog → softDelete', () => {
    const shuffled = [
      { id: '1', kind: 'auditLog' as const, enabled: true, order: 0 },
      { id: '2', kind: 'rbac' as const, enabled: true, order: 1 },
      { id: '3', kind: 'auth' as const, enabled: true, order: 2 },
      { id: '4', kind: 'rateLimit' as const, enabled: true, order: 3 },
    ];
    const sorted = sortByRecommendedOrder(shuffled);
    expect(sorted.map((s) => s.kind)).toEqual(['rateLimit', 'auth', 'rbac', 'auditLog']);
    expect(sorted.map((s) => s.order)).toEqual([0, 1, 2, 3]);
  });
});

describe('route validators', () => {
  it('uses the full schema when every writable field is accepted', () => {
    expect(routeValidatorExpr(create, posts)).toBe('CreatePostSchema');
    expect(routeValidatorExpr(update, posts)).toBe('UpdatePostSchema');
    expect(routeValidatorExpr(list, posts)).toBe('QueryPostSchema');
    expect(routeValidatorExpr(del, posts)).toBeNull();
  });

  it('narrows with .pick() when the route accepts a subset', () => {
    const narrowed = { ...create, bodyFields: ['title', 'status'] };
    expect(routeValidatorExpr(narrowed, posts)).toBe('CreatePostSchema.pick({ title: true, status: true })');
    const { code } = generateCollectionRouterCode(posts, [narrowed]);
    expect(code).toContain('validateRequest(CreatePostSchema.pick({ title: true, status: true }))');
  });

  it('widens the Query schema with extra filters routes opt into', () => {
    const withStatus = { ...list, queryFields: [...(list.queryFields ?? []), 'status'] };
    const zod = generateCollectionZodCode(posts, [withStatus]);
    expect(zod).toContain('  status: z.string().optional(),');
    expect(zod).toContain('meta: z.record(z.string(), z.any()).optional()');
    const { code } = generateCollectionRouterCode(posts, [withStatus]);
    expect(code).toContain("(['authorId', 'status'] as const)");
    expect(code).toContain('Post.find(filter)');
  });
});

describe('generateCollectionRouterCode', () => {
  it('reports the line range of each handler', () => {
    const endpoints = [list, get, create, update, del];
    const { code, ranges } = generateCollectionRouterCode(posts, endpoints);
    const lines = code.split('\n');
    for (const ep of endpoints) {
      const [start, end] = ranges[ep.id];
      expect(lines[start]).toBe(`// ${ep.method} ${ep.path} - ${ep.summary}`);
      expect(lines[end]).toBe('});');
    }
    expect(code).toContain("import { createRateLimiter, requireAuth, validateRequest, requireOwnership, requireRole } from './middleware';");
  });
});

describe('generateMiddlewareChainCode', () => {
  it('emits the ordered chain and only the middlewares it uses', () => {
    const code = generateMiddlewareChainCode(del, posts);
    expect(code).toContain('export const deletePostChain: RequestHandler[] = [');
    expect(code).toMatch(/requireAuth\(\),\s+\/\/ 1 · auth/);
    expect(code).toMatch(/requireRole\(\['admin'\]\),\s+\/\/ 2 · rbac/);
    expect(code).toContain('// request → requireAuth → requireRole → handler');
    expect(code).toContain('export function requireAuth');
    expect(code).toContain('export function requireRole');
    expect(code).not.toContain('export function createRateLimiter');
    expect(code).not.toContain('export function validateRequest');
  });
});

describe('normalizeRoutePath', () => {
  it('cleans user input into a safe Express path', () => {
    expect(normalizeRoutePath('api/posts/')).toBe('/api/posts');
    expect(normalizeRoutePath("/api//posts/:id'")).toBe('/api/posts/:id');
    expect(normalizeRoutePath(' /api/ posts ')).toBe('/api/posts');
  });
});
