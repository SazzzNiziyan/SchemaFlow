import { ApiEndpoint, CollectionNode, HttpMethod, MiddlewareKind, MiddlewareStep, SchemaField } from '../types';
import { modelNameFor, singularize } from './naming';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Produces a clean URL segment from collection name: 'Users' -> 'users', 'Order Items' -> 'order-items'. */
export function pluralRouteSegment(collectionName: string): string {
  const clean = collectionName.trim().replace(/[\s_]+/g, '-').toLowerCase();
  const sing = singularize(clean);
  if (sing.endsWith('y') && !/[aeiou]y$/i.test(sing)) {
    return `${sing.slice(0, -1)}ies`;
  }
  if (sing.endsWith('s')) return sing;
  return `${sing}s`;
}

/** Base REST path for a collection: 'Users' -> '/api/users'. */
export function collectionBasePath(collectionName: string): string {
  return `/api/${pluralRouteSegment(collectionName)}`;
}

/** Finds a candidate field name representing document owner (e.g. userId, authorId, creatorId). */
export function findOwnerField(fields: SchemaField[]): string | undefined {
  const match = fields.find((f) =>
    /^(userId|user_id|ownerId|owner_id|authorId|author_id|creatorId|creator_id|accountId|account_id)$/i.test(f.name),
  );
  return match?.name;
}

/** Fields a client may send in a create/update body (no primary key, no managed timestamps). */
export function bodyEligibleFields(collection: CollectionNode): SchemaField[] {
  return collection.fields.filter(
    (f) =>
      !f.isPrimaryKey &&
      f.name !== '_id' &&
      !(/^(createdAt|updatedAt)$/i.test(f.name) && collection.timestamps),
  );
}

/** Pagination keys every list route accepts; not schema fields. */
export const PAGINATION_QUERY_KEYS = ['page', 'limit', 'sort'] as const;

/** Methods whose handlers read a JSON body. */
export function methodHasBody(method: HttpMethod): boolean {
  return method === 'POST' || method === 'PUT' || method === 'PATCH';
}

/**
 * Normalizes user-typed route paths: leading slash, no whitespace or quotes
 * (which would break the generated string literal), no duplicate/trailing slashes.
 */
export function normalizeRoutePath(raw: string): string {
  let p = raw.replace(/[\s'"`\\]+/g, '');
  if (!p.startsWith('/')) p = `/${p}`;
  p = p.replace(/\/{2,}/g, '/');
  if (p.length > 1 && p.endsWith('/')) p = p.slice(0, -1);
  return p;
}

// ---------------------------------------------------------------------------
// Middleware metadata
// ---------------------------------------------------------------------------

export interface MiddlewareMeta {
  label: string;
  /** Factory emitted in generated code. */
  fn: string;
  description: string;
}

export const MIDDLEWARE_META: Record<MiddlewareKind, MiddlewareMeta> = {
  rateLimit: { label: 'Rate limit', fn: 'createRateLimiter', description: 'Throttle requests per IP (429 on overflow)' },
  auth: { label: 'Auth', fn: 'requireAuth', description: 'Require a Bearer token and attach req.user (401)' },
  validateZod: { label: 'Validate (Zod)', fn: 'validateRequest', description: 'Parse body / query against the Zod schema (400)' },
  rbac: { label: 'RBAC', fn: 'requireRole', description: 'Allow only the listed roles (403)' },
  ownership: { label: 'Ownership', fn: 'requireOwnership', description: 'Only the owner (or an admin) may mutate (403)' },
  auditLog: { label: 'Audit log', fn: 'auditAction', description: 'Record actor, action and target for compliance' },
  softDelete: { label: 'Soft delete', fn: 'softDelete', description: 'Set deletedAt instead of removing the document' },
};

/** Canonical execution order: cheap rejections first, then identity, input, authorization, side effects. */
export const RECOMMENDED_MIDDLEWARE_ORDER: MiddlewareKind[] = [
  'rateLimit',
  'auth',
  'validateZod',
  'rbac',
  'ownership',
  'auditLog',
  'softDelete',
];

/** Steps sorted by their `order` field. */
export function orderedSteps(steps: MiddlewareStep[]): MiddlewareStep[] {
  return [...steps].sort((a, b) => a.order - b.order);
}

/** Re-sorts a chain into {@link RECOMMENDED_MIDDLEWARE_ORDER}, rewriting `order` to 0..n-1. */
export function sortByRecommendedOrder(steps: MiddlewareStep[]): MiddlewareStep[] {
  const rank = (k: MiddlewareKind) => RECOMMENDED_MIDDLEWARE_ORDER.indexOf(k);
  return orderedSteps(steps)
    .map((s, i) => ({ s, i }))
    .sort((a, b) => rank(a.s.kind) - rank(b.s.kind) || a.i - b.i)
    .map(({ s }, order) => ({ ...s, order }));
}

/** Default config for a freshly added middleware step. */
export function defaultMiddlewareConfig(
  kind: MiddlewareKind,
  collection?: CollectionNode,
): MiddlewareStep['config'] | undefined {
  switch (kind) {
    case 'rateLimit':
      return { rpm: 60 };
    case 'rbac':
      return { roles: ['admin'] };
    case 'ownership': {
      const owner = collection ? findOwnerField(collection.fields) : undefined;
      return { ownerField: owner ?? 'userId' };
    }
    default:
      return undefined;
  }
}

export interface ChainIssue {
  severity: 'warning' | 'info';
  stepId?: string;
  message: string;
}

/**
 * Static checks for a route's middleware chain. Pure, so the UI can show them
 * inline and tests can pin them down.
 */
export function lintMiddlewareChain(endpoint: ApiEndpoint, collection?: CollectionNode): ChainIssue[] {
  const issues: ChainIssue[] = [];
  const steps = orderedSteps(endpoint.middlewares);
  const enabled = steps.filter((s) => s.enabled);
  const auth = enabled.find((s) => s.kind === 'auth');
  const authIndex = auth ? enabled.indexOf(auth) : -1;

  for (const [i, s] of enabled.entries()) {
    if (s.kind === 'rbac' || s.kind === 'ownership') {
      const label = MIDDLEWARE_META[s.kind].label;
      if (!auth) {
        issues.push({ severity: 'warning', stepId: s.id, message: `${label} needs Auth enabled — req.user is never set, so every request gets 401.` });
      } else if (i < authIndex) {
        issues.push({ severity: 'warning', stepId: s.id, message: `${label} runs before Auth — move Auth above it.` });
      }
    }
    if (s.kind === 'auditLog' && auth && i < authIndex) {
      issues.push({ severity: 'info', stepId: s.id, message: 'Audit log runs before Auth, so the actor is logged as anonymous.' });
    }
    if (s.kind === 'rateLimit' && i > 0) {
      issues.push({ severity: 'info', stepId: s.id, message: 'Rate limiting is cheapest as the first step.' });
    }
    if (s.kind === 'validateZod' && endpoint.method === 'DELETE') {
      issues.push({ severity: 'info', stepId: s.id, message: 'DELETE has no body or query schema — this step is skipped.' });
    }
    if (s.kind === 'softDelete' && endpoint.method !== 'DELETE') {
      issues.push({ severity: 'info', stepId: s.id, message: 'Soft delete only affects DELETE handlers.' });
    }
    if (s.kind === 'ownership' && collection) {
      // Same fallback the generator emits (`requireOwnership('userId')`).
      const owner = s.config?.ownerField ?? 'userId';
      if (!collection.fields.some((f) => f.name === owner)) {
        issues.push({ severity: 'warning', stepId: s.id, message: `Owner field "${owner}" does not exist on ${collection.name}.` });
      }
    }
    if (s.kind === 'rbac' && (!s.config?.roles || s.config.roles.length === 0)) {
      issues.push({ severity: 'info', stepId: s.id, message: 'No roles listed — defaults to admin only.' });
    }
  }

  const seen = new Set<MiddlewareKind>();
  for (const s of steps) {
    if (seen.has(s.kind)) {
      issues.push({ severity: 'info', stepId: s.id, message: `${MIDDLEWARE_META[s.kind].label} appears more than once.` });
    }
    seen.add(s.kind);
  }

  if (methodHasBody(endpoint.method) && !enabled.some((s) => s.kind === 'validateZod')) {
    issues.push({ severity: 'warning', message: `${endpoint.method} accepts a body without Zod validation.` });
  }
  if (endpoint.method !== 'GET' && !auth) {
    issues.push({ severity: 'warning', message: `${endpoint.method} is publicly writable — enable Auth.` });
  }
  return issues;
}

// ---------------------------------------------------------------------------
// Default Endpoints Builder
// ---------------------------------------------------------------------------

/**
 * Builds a standard set of 5 RESTful CRUD endpoints tailored to the collection:
 * - GET    /api/<plural>      (Pagination, sorting, foreign key & unique filters)
 * - GET    /api/<plural>/:id  (Find by ID)
 * - POST   /api/<plural>      (Create with Zod validation)
 * - PATCH  /api/<plural>/:id  (Partial update with Zod validation & ownership check)
 * - DELETE /api/<plural>/:id  (Delete with auth & admin RBAC)
 */
export function buildDefaultEndpoints(collection: CollectionNode): ApiEndpoint[] {
  const routeSegment = pluralRouteSegment(collection.name);
  const basePath = `/api/${routeSegment}`;
  const singName = singularize(collection.name.trim());

  // Determine query fields from foreign keys and unique fields
  const fkFields = collection.fields
    .filter((f) => f.isForeignKey || f.foreignKeyRef)
    .map((f) => f.name);
  const uniqueFields = collection.fields
    .filter((f) => f.validation.unique && !f.isPrimaryKey && f.name !== '_id')
    .map((f) => f.name);
  const queryFields = Array.from(new Set([...PAGINATION_QUERY_KEYS, ...fkFields, ...uniqueFields]));

  // Determine body fields for create/update (exclude _id and timestamps)
  const bodyFields = bodyEligibleFields(collection).map((f) => f.name);

  const ownerFieldName = findOwnerField(collection.fields);

  const endpoints: ApiEndpoint[] = [
    // 1. GET /api/<plural>
    {
      id: `ep_${collection.id}_list`,
      collectionId: collection.id,
      method: 'GET',
      path: basePath,
      summary: `List ${routeSegment} with pagination and filters`,
      tags: [collection.name],
      queryFields,
      middlewares: [
        {
          id: `mw_${collection.id}_list_rate`,
          kind: 'rateLimit',
          enabled: true,
          order: 0,
          config: { rpm: 100 },
        },
        {
          id: `mw_${collection.id}_list_auth`,
          kind: 'auth',
          enabled: false,
          order: 1,
        },
      ],
    },
    // 2. GET /api/<plural>/:id
    {
      id: `ep_${collection.id}_get`,
      collectionId: collection.id,
      method: 'GET',
      path: `${basePath}/:id`,
      summary: `Get ${singName} by ID`,
      tags: [collection.name],
      queryFields: [],
      middlewares: [
        {
          id: `mw_${collection.id}_get_rate`,
          kind: 'rateLimit',
          enabled: true,
          order: 0,
          config: { rpm: 120 },
        },
        {
          id: `mw_${collection.id}_get_auth`,
          kind: 'auth',
          enabled: false,
          order: 1,
        },
      ],
    },
    // 3. POST /api/<plural>
    {
      id: `ep_${collection.id}_create`,
      collectionId: collection.id,
      method: 'POST',
      path: basePath,
      summary: `Create a new ${singName}`,
      tags: [collection.name],
      bodyFields,
      middlewares: [
        {
          id: `mw_${collection.id}_create_auth`,
          kind: 'auth',
          enabled: true,
          order: 0,
        },
        {
          id: `mw_${collection.id}_create_val`,
          kind: 'validateZod',
          enabled: true,
          order: 1,
        },
        {
          id: `mw_${collection.id}_create_audit`,
          kind: 'auditLog',
          enabled: false,
          order: 2,
        },
      ],
    },
    // 4. PATCH /api/<plural>/:id
    {
      id: `ep_${collection.id}_update`,
      collectionId: collection.id,
      method: 'PATCH',
      path: `${basePath}/:id`,
      summary: `Partially update ${singName} by ID`,
      tags: [collection.name],
      bodyFields,
      middlewares: [
        {
          id: `mw_${collection.id}_patch_auth`,
          kind: 'auth',
          enabled: true,
          order: 0,
        },
        {
          id: `mw_${collection.id}_patch_val`,
          kind: 'validateZod',
          enabled: true,
          order: 1,
        },
        {
          id: `mw_${collection.id}_patch_own`,
          kind: 'ownership',
          enabled: Boolean(ownerFieldName),
          order: 2,
          config: ownerFieldName ? { ownerField: ownerFieldName } : undefined,
        },
        {
          id: `mw_${collection.id}_patch_audit`,
          kind: 'auditLog',
          enabled: false,
          order: 3,
        },
      ],
    },
    // 5. DELETE /api/<plural>/:id
    {
      id: `ep_${collection.id}_delete`,
      collectionId: collection.id,
      method: 'DELETE',
      path: `${basePath}/:id`,
      summary: `Delete ${singName} by ID`,
      tags: [collection.name],
      middlewares: [
        {
          id: `mw_${collection.id}_del_auth`,
          kind: 'auth',
          enabled: true,
          order: 0,
        },
        {
          id: `mw_${collection.id}_del_rbac`,
          kind: 'rbac',
          enabled: true,
          order: 1,
          config: { roles: ['admin'] },
        },
        {
          id: `mw_${collection.id}_del_soft`,
          kind: 'softDelete',
          enabled: false,
          order: 2,
        },
        {
          id: `mw_${collection.id}_del_audit`,
          kind: 'auditLog',
          enabled: false,
          order: 3,
        },
      ],
    },
  ];

  return endpoints;
}

// ---------------------------------------------------------------------------
// Zod Generator per Collection
// ---------------------------------------------------------------------------

/** Shared header for standalone snippets that reference `zObjectId`. */
const ZOD_PRELUDE =
  `// Helper regex for MongoDB 24-character hex ObjectId\n` +
  `const objectIdRegex = /^[0-9a-fA-F]{24}$/;\n` +
  `const zObjectId = z.string().regex(objectIdRegex, 'Invalid ObjectId');\n\n`;

/**
 * Names of schema fields that list routes may filter on: FK + unique fields,
 * plus anything a route opted into via `queryFields`.
 */
function queryFilterFields(collection: CollectionNode, endpoints: ApiEndpoint[] = []): string[] {
  const names = new Set(collection.fields.map((f) => f.name));
  const out = collection.fields
    .filter((f) => (f.isForeignKey || f.validation.unique) && f.name !== '_id')
    .map((f) => f.name);
  for (const ep of endpoints) {
    for (const q of ep.queryFields ?? []) {
      if (names.has(q) && !out.includes(q)) out.push(q);
    }
  }
  return out;
}

/**
 * Generates Zod validation schemas (Create, Update, Query) matching the collection's fields.
 * `endpoints` widens the Query schema with any extra filters those routes declare.
 */
export function generateCollectionZodCode(collection: CollectionNode, endpoints: ApiEndpoint[] = []): string {
  const modelName = modelNameFor(collection.name);

  let code = `// ============================================================================\n`;
  code += `// ${modelName} Zod Schemas\n`;
  code += `// ============================================================================\n`;
  code += `export const Create${modelName}Schema = z.object({\n`;

  collection.fields.forEach((field) => {
    if (field.isPrimaryKey && field.name === '_id') return;
    if (collection.timestamps && /^(createdAt|updatedAt)$/i.test(field.name)) return;

    let v = 'z.string()';
    switch (field.type) {
      case 'ObjectId':
        v = 'zObjectId';
        break;
      case 'Number':
      case 'Decimal':
        v = 'z.number()';
        if (field.validation.min !== undefined) v += `.min(${field.validation.min})`;
        if (field.validation.max !== undefined) v += `.max(${field.validation.max})`;
        break;
      case 'Boolean':
        v = 'z.boolean()';
        break;
      case 'Date':
        v = 'z.coerce.date()';
        break;
      case 'Enum':
        if (field.validation.enumOptions && field.validation.enumOptions.length > 0) {
          const opts = field.validation.enumOptions.map((o) => `'${o}'`).join(', ');
          v = `z.enum([${opts}])`;
        } else {
          v = 'z.string()';
        }
        break;
      case 'Array':
        if (field.array?.itemType === 'ObjectId') {
          v = 'z.array(zObjectId)';
        } else if (field.array?.itemType === 'Number') {
          v = 'z.array(z.number())';
        } else if (field.array?.itemType === 'Boolean') {
          v = 'z.array(z.boolean())';
        } else {
          v = 'z.array(z.string())';
        }
        if (field.array?.minItems !== undefined) v += `.min(${field.array.minItems})`;
        if (field.array?.maxItems !== undefined) v += `.max(${field.array.maxItems})`;
        break;
      case 'JSON':
        // Two-argument form works in both Zod 3 and Zod 4.
        v = 'z.record(z.string(), z.any())';
        break;
      default:
        v = 'z.string()';
        if (field.validation.min !== undefined) v += `.min(${field.validation.min})`;
        if (field.validation.max !== undefined) v += `.max(${field.validation.max})`;
        if (field.validation.match) {
          v += `.regex(${field.validation.match}, 'Does not match required format')`;
        }
    }

    if (!field.validation.required) {
      v += '.optional()';
    }

    code += `  ${field.name}: ${v},\n`;
  });

  code += `});\n\n`;
  code += `export const Update${modelName}Schema = Create${modelName}Schema.partial();\n\n`;
  code += `export const Query${modelName}Schema = z.object({\n`;
  code += `  page: z.coerce.number().int().min(1).default(1),\n`;
  code += `  limit: z.coerce.number().int().min(1).max(100).default(20),\n`;
  code += `  sort: z.string().optional(),\n`;

  queryFilterFields(collection, endpoints).forEach((name) => {
    code += `  ${name}: z.string().optional(),\n`;
  });

  code += `});\n\n`;
  return code;
}

/**
 * Validator expression a route's `validateZod` step uses. When the route only
 * accepts a subset of the collection's writable fields, the schema is narrowed
 * with `.pick()`.
 */
export function routeValidatorExpr(endpoint: ApiEndpoint, collection: CollectionNode): string | null {
  const modelName = modelNameFor(collection.name);
  if (endpoint.method === 'GET') return `Query${modelName}Schema`;
  if (!methodHasBody(endpoint.method)) return null;

  const base = endpoint.method === 'POST' ? `Create${modelName}Schema` : `Update${modelName}Schema`;
  if (!endpoint.bodyFields) return base;
  const eligible = bodyEligibleFields(collection).map((f) => f.name);
  const picked = eligible.filter((n) => endpoint.bodyFields!.includes(n));
  if (picked.length === eligible.length) return base;
  return `${base}.pick({ ${picked.map((n) => `${n}: true`).join(', ')} })`;
}

/**
 * Standalone Zod module for the "Zod Validators" preview: collection schemas
 * plus, when a route is given, the exact validator that route applies.
 */
export function generateRouteZodCode(
  collection: CollectionNode,
  endpoints: ApiEndpoint[],
  endpoint?: ApiEndpoint,
): string {
  let code = `import { z } from 'zod';\n\n${ZOD_PRELUDE}`;
  code += generateCollectionZodCode(collection, endpoints);

  if (endpoint) {
    const expr = routeValidatorExpr(endpoint, collection);
    const validates = endpoint.middlewares.some((m) => m.kind === 'validateZod' && m.enabled);
    code += `// ----------------------------------------------------------------------------\n`;
    code += `// ${endpoint.method} ${endpoint.path}\n`;
    if (!expr) {
      code += `// No request schema: ${endpoint.method} routes carry no body or query to validate.\n`;
    } else {
      const source = endpoint.method === 'GET' ? 'req.query' : 'req.body';
      code += `// Validates ${source} with:\n`;
      code += `//   ${expr}\n`;
      if (!validates) code += `// (validateZod is currently disabled on this route — input is NOT checked)\n`;
      if (endpoint.method === 'GET') {
        const filters = (endpoint.queryFields ?? []).filter((q) => !(PAGINATION_QUERY_KEYS as readonly string[]).includes(q));
        if (filters.length) code += `// Filterable by: ${filters.join(', ')}\n`;
      }
    }
  }
  return code.trimEnd() + '\n';
}

// ---------------------------------------------------------------------------
// Reusable Middleware Declarations
// ---------------------------------------------------------------------------

const MIDDLEWARE_HEADER = `// ============================================================================
// Production Express Middlewares
// ============================================================================

export interface AuthenticatedUser {
  id: string;
  email: string;
  role: string;
  [key: string]: unknown;
}

export interface RequestWithUser extends Request {
  user?: AuthenticatedUser;
}
`;

/** Implementations per middleware kind. `softDelete` lives in the DELETE handler. */
const MIDDLEWARE_SNIPPETS: Partial<Record<MiddlewareKind, string>> = {
  rateLimit: `
/**
 * 1. In-Memory Sliding-Window Rate Limiter.
 * In a distributed cluster, replace the in-memory Map with Redis (ioredis / node-redis).
 */
export function createRateLimiter(options: { rpm?: number } = {}) {
  const limit = options.rpm ?? 60;
  const windowMs = 60 * 1000;
  const ipBuckets = new Map<string, { count: number; resetAt: number }>();

  return (req: Request, res: Response, next: NextFunction): void => {
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    const now = Date.now();
    const bucket = ipBuckets.get(ip);

    if (!bucket || now > bucket.resetAt) {
      ipBuckets.set(ip, { count: 1, resetAt: now + windowMs });
      return next();
    }

    if (bucket.count >= limit) {
      const retryAfterSec = Math.ceil((bucket.resetAt - now) / 1000);
      res.set('Retry-After', String(retryAfterSec));
      res.status(429).json({
        error: 'Too Many Requests',
        message: \`Rate limit exceeded. Maximum \${limit} requests per minute.\`,
        retryAfter: retryAfterSec,
      });
      return;
    }

    bucket.count += 1;
    next();
  };
}
`,
  auth: `
/**
 * 2. Bearer Token Authentication Middleware.
 * Extracts and verifies JWT from the Authorization header.
 */
export function requireAuth() {
  return (req: Request, res: Response, next: NextFunction): void => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({
        error: 'Unauthorized',
        message: 'Missing or malformed Authorization header. Expected Bearer <token>.',
      });
      return;
    }

    const token = authHeader.slice(7).trim();
    if (!token) {
      res.status(401).json({ error: 'Unauthorized', message: 'Token cannot be empty.' });
      return;
    }

    // In production, verify with jwt.verify(token, process.env.JWT_SECRET!)
    // Mock user attached for development:
    (req as RequestWithUser).user = {
      id: 'usr_mock_123',
      email: 'engineer@schemaflow.io',
      role: 'admin',
    };
    next();
  };
}
`,
  rbac: `
/**
 * 3. Role-Based Access Control (RBAC) Middleware.
 */
export function requireRole(allowedRoles: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const user = (req as RequestWithUser).user;
    if (!user) {
      res.status(401).json({ error: 'Unauthorized', message: 'Authentication required for role validation.' });
      return;
    }

    if (!allowedRoles.includes(user.role)) {
      res.status(403).json({
        error: 'Forbidden',
        message: \`Insufficient permissions. Requires one of: [\${allowedRoles.join(', ')}].\`,
        requiredRoles: allowedRoles,
      });
      return;
    }
    next();
  };
}
`,
  validateZod: `
/**
 * 4. Zod Request Body & Query Validation Middleware.
 */
export function validateRequest(schema: z.ZodType, source: 'body' | 'query' = 'body') {
  return (req: Request, res: Response, next: NextFunction): void => {
    const payload = source === 'query' ? req.query : req.body;
    const result = schema.safeParse(payload);
    if (!result.success) {
      res.status(400).json({
        error: 'Validation Error',
        message: 'Invalid request payload against schema.',
        details: result.error.issues.map((e) => ({
          path: e.path.join('.'),
          message: e.message,
          code: e.code,
        })),
      });
      return;
    }

    if (source === 'query') {
      req.query = result.data as Request['query'];
    } else {
      req.body = result.data;
    }
    next();
  };
}
`,
  ownership: `
/**
 * 5. Resource Ownership Verification Middleware.
 * Ensures that the authenticated user owns the target record before mutating.
 */
export function requireOwnership(ownerField = 'userId') {
  return (req: Request, res: Response, next: NextFunction): void => {
    const user = (req as RequestWithUser).user;
    if (!user) {
      res.status(401).json({ error: 'Unauthorized', message: 'Authentication required to verify resource ownership.' });
      return;
    }

    // Admins bypass ownership check
    if (user.role === 'admin') {
      return next();
    }

    // In production, fetch target document from DB:
    // const doc = await Model.findById(req.params.id);
    // if (!doc) return res.status(404).json({ error: 'Not Found' });
    // if (doc[ownerField]?.toString() !== user.id) return res.status(403).json({ error: 'Forbidden' });

    next();
  };
}
`,
  auditLog: `
/**
 * 6. Audit Logging Middleware.
 * Captures request actor, target resource, and HTTP method for compliance logs.
 */
export function auditAction(actionName: string) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const user = (req as RequestWithUser).user;
    const timestamp = new Date().toISOString();
    console.info(\`[AUDIT] \${timestamp} | User: \${user?.id ?? 'anon'} | Action: \${actionName} | \${req.method} \${req.originalUrl}\`);
    next();
  };
}
`,
};

/**
 * Emits clean, production-grade Express TypeScript middleware implementations.
 * Pass `kinds` to emit only the middlewares a chain actually uses.
 */
export function generateMiddlewareDeclarations(kinds?: Iterable<MiddlewareKind>): string {
  const wanted = kinds ? new Set(kinds) : null;
  let code = MIDDLEWARE_HEADER;
  for (const kind of RECOMMENDED_MIDDLEWARE_ORDER) {
    const snippet = MIDDLEWARE_SNIPPETS[kind];
    if (snippet && (!wanted || wanted.has(kind))) code += snippet;
  }
  return code;
}

// ---------------------------------------------------------------------------
// Route & Controller Generator
// ---------------------------------------------------------------------------

/**
 * Converts a MiddlewareStep into its executable Express invocation string.
 * `validatorExpr` overrides the default Zod schema for `validateZod`.
 */
export function formatMiddlewareInvocation(
  step: MiddlewareStep,
  modelName: string,
  method: HttpMethod,
  validatorExpr?: string | null,
): string | null {
  if (!step.enabled) return null;

  switch (step.kind) {
    case 'rateLimit': {
      const rpm = step.config?.rpm ?? 60;
      return `createRateLimiter({ rpm: ${rpm} })`;
    }
    case 'auth':
      return `requireAuth()`;
    case 'rbac': {
      const roles = step.config?.roles && step.config.roles.length > 0 ? step.config.roles : ['admin'];
      const rolesStr = roles.map((r) => `'${r}'`).join(', ');
      return `requireRole([${rolesStr}])`;
    }
    case 'validateZod': {
      if (method === 'GET') return `validateRequest(${validatorExpr ?? `Query${modelName}Schema`}, 'query')`;
      if (method === 'POST') return `validateRequest(${validatorExpr ?? `Create${modelName}Schema`})`;
      if (method === 'PATCH' || method === 'PUT') return `validateRequest(${validatorExpr ?? `Update${modelName}Schema`})`;
      return null;
    }
    case 'ownership': {
      const owner = step.config?.ownerField ?? 'userId';
      return `requireOwnership('${owner}')`;
    }
    case 'auditLog': {
      const act = `${method.toLowerCase()}_${modelName.toLowerCase()}`;
      return `auditAction('${act}')`;
    }
    case 'softDelete':
      // Handled inside the delete controller logic
      return null;
    default:
      return null;
  }
}

/** Path relative to the collection router (`/api/users/:id` -> `/:id`). */
export function routerSubPath(endpoint: ApiEndpoint, collection: CollectionNode): string {
  const routeSegment = pluralRouteSegment(collection.name);
  let subPath = endpoint.path.replace(new RegExp(`^/api/${routeSegment}(?=/|$)`), '') || '/';
  if (!subPath.startsWith('/')) subPath = `/${subPath}`;
  return subPath;
}

/** Ordered, enabled middleware invocations for a route. */
export function middlewareInvocations(endpoint: ApiEndpoint, collection: CollectionNode): string[] {
  const modelName = modelNameFor(collection.name);
  const validator = routeValidatorExpr(endpoint, collection);
  return orderedSteps(endpoint.middlewares)
    .map((step) => formatMiddlewareInvocation(step, modelName, endpoint.method, validator))
    .filter((s): s is string => Boolean(s));
}

function routerVarFor(collection: CollectionNode): string {
  const modelName = modelNameFor(collection.name);
  return `${modelName.charAt(0).toLowerCase()}${modelName.slice(1)}Router`;
}

/** Express handler (route registration + controller body) for one endpoint. */
export function generateEndpointHandlerCode(endpoint: ApiEndpoint, collection: CollectionNode): string {
  const ep = endpoint;
  const modelName = modelNameFor(collection.name);
  const routerVar = routerVarFor(collection);
  const methodLower = ep.method.toLowerCase();
  const subPath = routerSubPath(ep, collection);
  const mwInvocations = middlewareInvocations(ep, collection);
  const mwChain = mwInvocations.length > 0 ? `${mwInvocations.join(', ')}, ` : '';
  const hasSoftDelete = ep.middlewares.some((s) => s.kind === 'softDelete' && s.enabled);
  const fieldNames = new Set(collection.fields.map((f) => f.name));
  const filters = (ep.queryFields ?? []).filter(
    (q) => fieldNames.has(q) && !(PAGINATION_QUERY_KEYS as readonly string[]).includes(q),
  );

  let code = `// ${ep.method} ${ep.path} - ${ep.summary}\n`;
  code += `${routerVar}.${methodLower}('${subPath}', ${mwChain}async (req: Request, res: Response, next: NextFunction): Promise<void> => {\n`;
  code += `  try {\n`;

  switch (ep.method) {
    case 'GET': {
      if (subPath.includes(':id')) {
        code += `    const { id } = req.params;\n`;
        code += `    if (!objectIdRegex.test(id)) {\n`;
        code += `      res.status(400).json({ error: 'Bad Request', message: 'Invalid ID format' });\n`;
        code += `      return;\n`;
        code += `    }\n`;
        code += `    // In production: const doc = await ${modelName}.findById(id).lean();\n`;
        code += `    // if (!doc) { res.status(404).json({ error: 'Not Found', message: '${modelName} not found' }); return; }\n`;
        code += `    res.status(200).json({ success: true, data: { id } });\n`;
      } else {
        code += `    const page = Math.max(1, Number(req.query.page) || 1);\n`;
        code += `    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));\n`;
        code += `    const skip = (page - 1) * limit;\n`;
        if (filters.length > 0) {
          code += `    const filter = Object.fromEntries(\n`;
          code += `      ([${filters.map((f) => `'${f}'`).join(', ')}] as const)\n`;
          code += `        .filter((key) => req.query[key] !== undefined)\n`;
          code += `        .map((key) => [key, req.query[key]]),\n`;
          code += `    );\n`;
        }
        const findArg = filters.length > 0 ? 'filter' : '';
        code += `    // In production: const [items, total] = await Promise.all([\n`;
        code += `    //   ${modelName}.find(${findArg}).skip(skip).limit(limit).lean(),\n`;
        code += `    //   ${modelName}.countDocuments(${findArg}),\n`;
        code += `    // ]);\n`;
        code += `    res.status(200).json({\n`;
        code += `      success: true,\n`;
        code += `      pagination: { page, limit, total: 0, totalPages: 0 },\n`;
        code += `      data: [],\n`;
        code += `    });\n`;
      }
      break;
    }

    case 'POST': {
      code += `    // In production: const created = await ${modelName}.create(req.body);\n`;
      code += `    res.status(201).json({ success: true, data: req.body });\n`;
      break;
    }

    case 'PATCH':
    case 'PUT': {
      code += `    const { id } = req.params;\n`;
      code += `    if (!objectIdRegex.test(id)) {\n`;
      code += `      res.status(400).json({ error: 'Bad Request', message: 'Invalid ID format' });\n`;
      code += `      return;\n`;
      code += `    }\n`;
      const op = ep.method === 'PUT' ? 'findOneAndReplace({ _id: id }, req.body' : 'findByIdAndUpdate(id, req.body';
      code += `    // In production: const updated = await ${modelName}.${op}, { new: true, runValidators: true });\n`;
      code += `    // if (!updated) { res.status(404).json({ error: 'Not Found', message: '${modelName} not found' }); return; }\n`;
      code += `    res.status(200).json({ success: true, id, data: req.body });\n`;
      break;
    }

    case 'DELETE': {
      code += `    const { id } = req.params;\n`;
      code += `    if (!objectIdRegex.test(id)) {\n`;
      code += `      res.status(400).json({ error: 'Bad Request', message: 'Invalid ID format' });\n`;
      code += `      return;\n`;
      code += `    }\n`;
      if (hasSoftDelete) {
        code += `    // Soft-delete: update deletedAt timestamp instead of removing document\n`;
        code += `    // const deleted = await ${modelName}.findByIdAndUpdate(id, { deletedAt: new Date() }, { new: true });\n`;
        code += `    // if (!deleted) { res.status(404).json({ error: 'Not Found', message: '${modelName} not found' }); return; }\n`;
        code += `    res.status(200).json({ success: true, id, softDeleted: true });\n`;
      } else {
        code += `    // In production: const deleted = await ${modelName}.findByIdAndDelete(id);\n`;
        code += `    // if (!deleted) { res.status(404).json({ error: 'Not Found', message: '${modelName} not found' }); return; }\n`;
        code += `    res.status(200).json({ success: true, id, deleted: true });\n`;
      }
      break;
    }
  }

  code += `  } catch (err: any) {\n`;
  code += `    // Handle duplicate key error (MongoDB code 11000)\n`;
  code += `    if (err?.code === 11000) {\n`;
  code += `      res.status(409).json({\n`;
  code += `        error: 'Conflict',\n`;
  code += `        message: 'A resource with this unique value already exists.',\n`;
  code += `        fields: err.keyPattern,\n`;
  code += `      });\n`;
  code += `      return;\n`;
  code += `    }\n`;
  code += `    next(err);\n`;
  code += `  }\n`;
  code += `});\n\n`;
  return code;
}

function routerHeader(collection: CollectionNode): string {
  const modelName = modelNameFor(collection.name);
  let code = `// ============================================================================\n`;
  code += `// ${modelName} Express Router\n`;
  code += `// ============================================================================\n`;
  code += `export const ${routerVarFor(collection)} = Router();\n\n`;
  return code;
}

export interface CollectionRouterCode {
  code: string;
  /** 0-based inclusive line range of each endpoint's handler within `code`. */
  ranges: Record<string, [number, number]>;
}

/**
 * Standalone router module for one collection (imports + handlers), with the
 * line range of each endpoint so the preview can highlight the active route.
 */
export function generateCollectionRouterCode(collection: CollectionNode, endpoints: ApiEndpoint[]): CollectionRouterCode {
  const modelName = modelNameFor(collection.name);
  const schemas = new Set<string>();
  const usedFns = new Set<string>();
  endpoints.forEach((ep) => {
    orderedSteps(ep.middlewares).forEach((s) => {
      if (!s.enabled || s.kind === 'softDelete') return;
      if (s.kind === 'validateZod') {
        if (ep.method === 'DELETE') return;
        const expr = routeValidatorExpr(ep, collection);
        const base = expr?.match(/^\w+/)?.[0];
        if (base) schemas.add(base);
      }
      usedFns.add(MIDDLEWARE_META[s.kind].fn);
    });
  });

  let code = `import { Router, Request, Response, NextFunction } from 'express';\n`;
  if (usedFns.size) code += `import { ${[...usedFns].join(', ')} } from './middleware';\n`;
  if (schemas.size) code += `import { ${[...schemas].join(', ')} } from './${modelName.toLowerCase()}.schemas';\n`;
  code += `\nconst objectIdRegex = /^[0-9a-fA-F]{24}$/;\n\n`;
  code += routerHeader(collection);

  const ranges: Record<string, [number, number]> = {};
  for (const ep of endpoints) {
    const start = code.split('\n').length - 1;
    const chunk = generateEndpointHandlerCode(ep, collection);
    code += chunk;
    // chunk ends with "});\n\n" → last handler line is two lines before the end.
    ranges[ep.id] = [start, start + chunk.split('\n').length - 3];
  }
  return { code: code.trimEnd() + '\n', ranges };
}

/**
 * "Middleware Chain" preview for one route: the ordered pipeline as a typed
 * array, followed by implementations of exactly the middlewares it uses.
 */
export function generateMiddlewareChainCode(endpoint: ApiEndpoint, collection: CollectionNode): string {
  const modelName = modelNameFor(collection.name);
  const steps = orderedSteps(endpoint.middlewares);
  const enabled = steps.filter((s) => s.enabled);
  const validator = routeValidatorExpr(endpoint, collection);
  const verb: Record<HttpMethod, string> = { GET: 'read', POST: 'create', PUT: 'replace', PATCH: 'update', DELETE: 'delete' };
  const chainVar = `${verb[endpoint.method]}${modelName}${endpoint.method === 'GET' && !endpoint.path.includes(':') ? 'List' : ''}Chain`;

  const lines: { expr: string; note: string }[] = [];
  enabled.forEach((s) => {
    const expr = formatMiddlewareInvocation(s, modelName, endpoint.method, validator);
    if (expr) lines.push({ expr: `${expr},`, note: `${lines.length + 1} · ${s.kind}` });
  });

  let code = `import type { Request, Response, NextFunction, RequestHandler } from 'express';\n`;
  code += `import { z } from 'zod';\n\n`;
  code += `// ${endpoint.method} ${endpoint.path}${endpoint.summary ? ` — ${endpoint.summary}` : ''}\n`;
  const flow = ['request', ...lines.map((l) => l.expr.replace(/\(.*$/, '')), 'handler'];
  code += `// ${flow.join(' → ')}\n`;
  const skipped = steps.filter((s) => !s.enabled).map((s) => s.kind);
  if (skipped.length) code += `// disabled: ${skipped.join(', ')}\n`;
  if (enabled.some((s) => s.kind === 'softDelete')) code += `// softDelete: applied inside the DELETE handler (sets deletedAt)\n`;

  if (lines.length === 0) {
    code += `export const ${chainVar}: RequestHandler[] = [];\n`;
  } else {
    const width = Math.max(...lines.map((l) => l.expr.length));
    code += `export const ${chainVar}: RequestHandler[] = [\n`;
    lines.forEach((l) => {
      code += `  ${l.expr.padEnd(width)}  // ${l.note}\n`;
    });
    code += `];\n`;
  }

  const kinds = enabled.map((s) => s.kind).filter((k) => !(k === 'validateZod' && !validator));
  if (kinds.some((k) => MIDDLEWARE_SNIPPETS[k])) {
    code += `\n${generateMiddlewareDeclarations(kinds)}`;
  }
  return code.trimEnd() + '\n';
}

export interface ApiRouterOptions {
  includeMiddlewares?: boolean;
  includeZod?: boolean;
}

/**
 * Generates clean, idiomatic Node.js + Express + TypeScript code with middleware
 * chains, proper HTTP status codes, and error forwarding.
 */
export function generateApiRouterCode(
  endpoints: ApiEndpoint[],
  collections: CollectionNode[],
  options: ApiRouterOptions = {},
): string {
  if (collections.length === 0) return '// No collections defined';

  const includeMiddlewares = options.includeMiddlewares !== false;
  const includeZod = options.includeZod !== false;

  let code = `import { Router, Request, Response, NextFunction } from 'express';\n`;
  code += `import { z } from 'zod';\n\n`;
  code += ZOD_PRELUDE;

  if (includeMiddlewares) {
    code += generateMiddlewareDeclarations() + '\n';
  }

  // Group endpoints by collection
  const endpointsByCol = new Map<string, ApiEndpoint[]>();
  endpoints.forEach((ep) => {
    const list = endpointsByCol.get(ep.collectionId) ?? [];
    list.push(ep);
    endpointsByCol.set(ep.collectionId, list);
  });

  collections.forEach((col) => {
    const colEndpoints = endpointsByCol.get(col.id) ?? buildDefaultEndpoints(col);

    if (includeZod) {
      code += generateCollectionZodCode(col, colEndpoints);
    }

    code += routerHeader(col);
    colEndpoints.forEach((ep) => {
      code += generateEndpointHandlerCode(ep, col);
    });
  });

  return code.trim();
}
