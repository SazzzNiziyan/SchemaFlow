import express from 'express';
import path from 'path';
import dotenv from 'dotenv';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI, Type } from '@google/genai';
import { MongoClient, ObjectId } from 'mongodb';
import { z } from 'zod';
import { getMemoryStatsMb } from './src/utils/serverMetrics';

export { getMemoryStatsMb };

dotenv.config();

// ---------------------------------------------------------------------------
// Security & Validation Helpers
// ---------------------------------------------------------------------------

/** Strips database credentials from connection strings in error messages. */
function sanitizeErrorMessage(err: unknown): string {
  if (!err) return 'An unexpected error occurred';
  const raw = err instanceof Error ? err.message : String(err);
  return raw.replace(/(mongodb(?:\+srv)?:\/\/[^:]+:)[^@]+(@)/gi, '$1***$2');
}

/** Total time budget for one AI schema generation, including retries. */
const AI_REQUEST_TIMEOUT_MS = 120_000;

/** Gemini errors worth retrying: overload / rate limit / transient upstream failures. */
function isTransientAiError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  const status = (err as { status?: number })?.status;
  return (
    status === 429 || status === 500 || status === 503 || status === 504 ||
    /\b(429|500|503|504)\b|UNAVAILABLE|RESOURCE_EXHAUSTED|high demand|overloaded|fetch failed|ECONNRESET|ETIMEDOUT/i.test(msg)
  );
}

/** Turns raw Gemini error JSON into a short message the UI can show as-is. */
function friendlyAiError(err: unknown): { status: number; message: string } {
  const msg = err instanceof Error ? err.message : String(err);
  if ((err as Error)?.name === 'AbortError' || /aborted/i.test(msg)) {
    return { status: 504, message: 'The AI model took too long to respond. Please try again in a moment.' };
  }
  if (/RESOURCE_EXHAUSTED|\b429\b|quota/i.test(msg)) {
    return { status: 429, message: 'Gemini rate limit or quota reached. Wait a minute and try again.' };
  }
  if (isTransientAiError(err)) {
    return { status: 503, message: 'Gemini is overloaded right now (Google-side). Please try again in a minute.' };
  }
  if (/NOT_FOUND|\b404\b/.test(msg)) {
    return { status: 502, message: 'The configured Gemini model is unavailable. Set GEMINI_MODEL in .env to a current model.' };
  }
  if (/API key|PERMISSION_DENIED|\b40[13]\b/i.test(msg)) {
    return { status: 502, message: 'Gemini rejected the API key. Check GEMINI_API_KEY in .env.' };
  }
  return { status: 500, message: sanitizeErrorMessage(err) };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** In-memory IP rate limiter to protect Gemini AI and MongoDB connection endpoints. */
interface RateLimitRecord {
  count: number;
  resetAt: number;
}
const rateLimitMap = new Map<string, RateLimitRecord>();

function createRateLimiter(windowMs: number, maxRequests: number, endpointName = 'API') {
  return (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const forwarded = req.headers['x-forwarded-for'];
    const clientIp = (Array.isArray(forwarded) ? forwarded[0] : forwarded) || req.socket.remoteAddress || 'unknown-client';
    const key = `${endpointName}:${clientIp}`;
    const now = Date.now();
    const record = rateLimitMap.get(key);

    if (!record || now > record.resetAt) {
      rateLimitMap.set(key, { count: 1, resetAt: now + windowMs });
      return next();
    }

    if (record.count >= maxRequests) {
      const retryAfterSec = Math.ceil((record.resetAt - now) / 1000);
      res.setHeader('Retry-After', retryAfterSec);
      return res.status(429).json({
        error: `Rate limit exceeded for ${endpointName}. Try again in ${retryAfterSec}s.`,
      });
    }

    record.count++;
    next();
  };
}

/** Conservative connection options with fast failover timeouts for 512MB RAM / 0.1 CPU environments. */
const MONGO_CLIENT_OPTIONS = {
  serverSelectionTimeoutMS: 5000,
  connectTimeoutMS: 5000,
  socketTimeoutMS: 10000,
  maxPoolSize: 5,
  minPoolSize: 0,
  maxIdleTimeMS: 15000,
};

// Optional interval logger (every 15s) active only when LOG_MEM_STATS === "true"
if (process.env.LOG_MEM_STATS === 'true') {
  setInterval(() => {
    const stats = getMemoryStatsMb();
    console.log(
      `[MEM-STATS] Uptime: ${Math.floor(process.uptime())}s | RSS: ${stats.rss}MB | HeapUsed: ${stats.heapUsed}MB | HeapTotal: ${stats.heapTotal}MB | ArrayBuffers: ${stats.arrayBuffers}MB`,
    );
  }, 15_000).unref();
}

// Zod Request Validation Schemas
const MongoUriValidation = z
  .string()
  .min(1, 'MongoDB connection URI is required')
  .refine(
    (uri) => uri.startsWith('mongodb://') || uri.startsWith('mongodb+srv://'),
    'URI must begin with "mongodb://" or "mongodb+srv://"',
  );

const DatabasesRequestSchema = z.object({
  uri: MongoUriValidation,
});

const CollectionsRequestSchema = z.object({
  uri: MongoUriValidation,
  dbName: z.string().min(1, 'Database name is required').max(128),
});

const ImportRequestSchema = z.object({
  uri: MongoUriValidation,
  dbName: z.string().min(1, 'Database name is required').max(128),
  collectionNames: z
    .array(z.string().min(1))
    .min(1, 'At least one collection must be selected')
    .max(50, 'Max 50 collections per import'),
});

const GenerateSchemaRequestSchema = z.object({
  prompt: z
    .string()
    .min(3, 'Prompt must be at least 3 characters')
    .max(2000, 'Prompt cannot exceed 2000 characters'),
  framework: z
    .enum(['mongoose', 'prisma', 'postgres', 'drizzle', 'typescript', 'jsonSchema'])
    .optional()
    .default('mongoose'),
});

// ---------------------------------------------------------------------------
// Server Bootstrap
// ---------------------------------------------------------------------------

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;

  // 1. Cap JSON and URL-encoded body sizes to 1mb to prevent RAM exhaustion
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true, limit: '1mb' }));

  // 2. Request timeout guardrail: abort stalled requests under low CPU (0.1 CPU) load
  // AI generation legitimately takes 10–60s (longer when Gemini is busy), so it gets
  // its own budget; everything else keeps the tight 15s cap.
  const REQUEST_TIMEOUT_MS = 15_000;
  app.use((req, res, next) => {
    const isAi = req.path === '/api/generate-schema';
    res.setTimeout(isAi ? AI_REQUEST_TIMEOUT_MS + 5_000 : REQUEST_TIMEOUT_MS, () => {
      if (!res.headersSent) {
        res.status(504).json({
          error: isAi
            ? 'The AI model took too long to respond. Please try again in a moment.'
            : 'Request timed out under high server load.',
        });
      }
    });
    next();
  });

  // Task 1: Health & memory metrics endpoint for monitoring and stress tests
  app.get('/health', (_req, res) => {
    res.status(200).json({
      ok: true,
      uptimeSec: Math.floor(process.uptime()),
      memoryMb: getMemoryStatsMb(),
    });
  });

  // Backward-compatible API health check
  app.get('/api/health', (_req, res) => {
    res.json({
      status: 'ok',
      service: 'SchemaFlow Core API',
      timestamp: new Date().toISOString(),
      uptimeSec: Math.floor(process.uptime()),
      memoryMb: getMemoryStatsMb(),
    });
  });

  // MongoDB Introspection: List Databases
  app.post(
    '/api/mongodb/databases',
    createRateLimiter(60_000, 30, 'MongoDB Explorer'),
    async (req, res) => {
      const parsed = DatabasesRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid request' });
      }

      const client = new MongoClient(parsed.data.uri, MONGO_CLIENT_OPTIONS);
      const closeClient = () => client.close().catch(() => {});
      req.on('close', () => {
        if (!res.writableEnded) closeClient();
      });

      try {
        await client.connect();
        const adminDb = client.db('admin');
        const dbs = await adminDb.admin().listDatabases();
        res.json({ success: true, databases: dbs.databases.map((d) => d.name) });
      } catch (err: unknown) {
        console.error('Error connecting to MongoDB:', sanitizeErrorMessage(err));
        res.status(500).json({ error: sanitizeErrorMessage(err) });
      } finally {
        await closeClient();
      }
    },
  );

  // MongoDB Introspection: List Collections
  app.post(
    '/api/mongodb/collections',
    createRateLimiter(60_000, 30, 'MongoDB Explorer'),
    async (req, res) => {
      const parsed = CollectionsRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid request' });
      }

      const client = new MongoClient(parsed.data.uri, MONGO_CLIENT_OPTIONS);
      const closeClient = () => client.close().catch(() => {});
      req.on('close', () => {
        if (!res.writableEnded) closeClient();
      });

      try {
        await client.connect();
        const db = client.db(parsed.data.dbName);
        const collections = await db.listCollections().toArray();
        res.json({ success: true, collections: collections.map((c) => c.name) });
      } catch (err: unknown) {
        console.error('Error fetching collections:', sanitizeErrorMessage(err));
        res.status(500).json({ error: sanitizeErrorMessage(err) });
      } finally {
        await closeClient();
      }
    },
  );

  // MongoDB Introspection: Reverse-Engineer Schema
  app.post(
    '/api/mongodb/import',
    createRateLimiter(60_000, 20, 'MongoDB Importer'),
    async (req, res) => {
      const parsed = ImportRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid request' });
      }

      const { uri, dbName, collectionNames } = parsed.data;
      const client = new MongoClient(uri, MONGO_CLIENT_OPTIONS);
      const closeClient = () => client.close().catch(() => {});
      req.on('close', () => {
        if (!res.writableEnded) closeClient();
      });

      try {
        await client.connect();
        const db = client.db(dbName);
        const generatedCollections = [];
        let xOffset = 50;
        let yOffset = 100;

        for (const colName of collectionNames) {
          const collection = db.collection(colName);
          const sampleDocs = await collection.find().limit(50).toArray();
          const fieldsMap = new Map<string, any>();

          // Infer fields from sample documents
          sampleDocs.forEach((doc) => {
            Object.keys(doc).forEach((key) => {
              if (!fieldsMap.has(key)) {
                const val = doc[key];
                let type = 'String';
                let isForeignKey = false;

                if (val instanceof ObjectId) {
                  type = 'ObjectId';
                  if (key !== '_id' && (key.toLowerCase().endsWith('id') || key.toLowerCase().endsWith('_id'))) {
                    isForeignKey = true;
                  }
                } else if (typeof val === 'number') {
                  type = 'Number';
                } else if (typeof val === 'boolean') {
                  type = 'Boolean';
                } else if (val instanceof Date) {
                  type = 'Date';
                } else if (Array.isArray(val)) {
                  type = 'Array';
                } else if (typeof val === 'object' && val !== null) {
                  type = 'JSON';
                }

                fieldsMap.set(key, {
                  id: `f_${colName}_${key}`,
                  name: key,
                  type,
                  isPrimaryKey: key === '_id',
                  isForeignKey,
                  validation: { required: false },
                });
              }
            });
          });

          // Guarantee _id primary key exists
          if (!fieldsMap.has('_id')) {
            fieldsMap.set('_id', {
              id: `f_${colName}__id`,
              name: '_id',
              type: 'ObjectId',
              isPrimaryKey: true,
              isForeignKey: false,
              validation: { required: true },
            });
          }

          generatedCollections.push({
            id: `col_${colName}`,
            name: colName,
            icon: 'Database',
            colorTag: '#6366F1',
            position: { x: xOffset, y: yOffset },
            fields: Array.from(fieldsMap.values()),
          });

          xOffset += 400;
          if (xOffset > 1200) {
            xOffset = 50;
            yOffset += 350;
          }
        }

        // Post-process heuristic linking for foreign keys
        generatedCollections.forEach((col) => {
          col.fields.forEach((field) => {
            if (field.isForeignKey) {
              let possibleTarget = field.name.replace(/id$/i, '').replace(/_$/, '').toLowerCase();
              if (possibleTarget === 'user') possibleTarget = 'users';
              else if (!possibleTarget.endsWith('s')) possibleTarget += 's';

              const targetCol = generatedCollections.find((c) => c.name.toLowerCase() === possibleTarget);
              if (targetCol) {
                const targetPk = targetCol.fields.find((f) => f.isPrimaryKey);
                if (targetPk) {
                  field.foreignKeyRef = {
                    targetCollectionId: targetCol.id,
                    targetFieldId: targetPk.id,
                    relationType: 'one-to-many',
                  };
                }
              }
            }
          });
        });

        res.json({ success: true, collections: generatedCollections });
      } catch (err: unknown) {
        console.error('Error importing collections:', sanitizeErrorMessage(err));
        res.status(500).json({ error: sanitizeErrorMessage(err) });
      } finally {
        await closeClient();
      }
    },
  );

  // AI Schema Architect Endpoint using Gemini API
  app.post(
    '/api/generate-schema',
    createRateLimiter(60_000, 15, 'AI Schema Generator'),
    async (req, res) => {
      const parsed = GenerateSchemaRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid prompt' });
      }

      const { prompt, framework } = parsed.data;
      const apiKey = process.env.GEMINI_API_KEY;

      if (!apiKey) {
        return res.status(500).json({
          error: 'GEMINI_API_KEY is not configured on the server. Please set it in .env.',
        });
      }

      try {
        const ai = new GoogleGenAI({
          apiKey,
          httpOptions: {
            headers: {
              'User-Agent': 'SchemaFlow-Architect/1.0',
            },
          },
        });

        // Cancel the upstream call at the deadline or when the browser disconnects.
        const controller = new AbortController();
        const deadline = Date.now() + AI_REQUEST_TIMEOUT_MS;
        const abortTimer = setTimeout(() => controller.abort(), AI_REQUEST_TIMEOUT_MS);
        res.on('close', () => controller.abort());

        // Each attempt also has its own cap, so one hung call can't eat the whole budget.
        const generate = (model: string, signal: AbortSignal) => ai.models.generateContent({
          model,
          contents: `You are a principal MongoDB database architect.
Generate a comprehensive, production-ready schema based on this specification: "${prompt}".
Target Framework: ${framework}.

Rules:
1. Each collection must have an "_id" field with type "ObjectId" and isPrimaryKey: true.
2. Provide foreign keys where appropriate with "foreignKeyRef" pointing to targetCollectionId and targetFieldId.
3. Apply validations: required, unique (for emails/slugs/usernames), min/max where relevant.
4. Color tags should be crisp modern hex codes (e.g. #6366F1, #10B981, #F59E0B, #EC4899, #3B82F6, #8B5CF6).
5. Output clean JSON matching the schema.`,
          config: {
            abortSignal: signal,
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                collections: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      id: { type: Type.STRING },
                      name: { type: Type.STRING },
                      icon: { type: Type.STRING },
                      colorTag: { type: Type.STRING },
                      position: {
                        type: Type.OBJECT,
                        properties: {
                          x: { type: Type.NUMBER },
                          y: { type: Type.NUMBER },
                        },
                        required: ['x', 'y'],
                      },
                      fields: {
                        type: Type.ARRAY,
                        items: {
                          type: Type.OBJECT,
                          properties: {
                            id: { type: Type.STRING },
                            name: { type: Type.STRING },
                            type: { type: Type.STRING },
                            isPrimaryKey: { type: Type.BOOLEAN },
                            isForeignKey: { type: Type.BOOLEAN },
                            foreignKeyRef: {
                              type: Type.OBJECT,
                              properties: {
                                targetCollectionId: { type: Type.STRING },
                                targetFieldId: { type: Type.STRING },
                              },
                            },
                            validation: {
                              type: Type.OBJECT,
                              properties: {
                                required: { type: Type.BOOLEAN },
                                unique: { type: Type.BOOLEAN },
                                match: { type: Type.STRING },
                                defaultVal: { type: Type.STRING },
                              },
                            },
                          },
                          required: ['id', 'name', 'type', 'validation'],
                        },
                      },
                    },
                    required: ['id', 'name', 'position', 'fields'],
                  },
                },
              },
              required: ['collections'],
            },
          },
        });

        // Retry transient overload errors / hung calls with backoff. With
        // GEMINI_FALLBACK_MODEL set, switch to it after two primary failures.
        const primary = process.env.GEMINI_MODEL || 'gemini-3.8-flash';
        const fallback = (process.env.GEMINI_FALLBACK_MODEL ?? 'gemini-3.6-flash').trim();
        const plan =
          fallback && fallback !== primary ? [primary, primary, fallback, fallback] : [primary, primary, primary];
        const ATTEMPT_TIMEOUT_MS = 50_000;
        let response: Awaited<ReturnType<typeof generate>> | undefined;
        let lastErr: unknown;
        try {
          for (let attempt = 0; attempt < plan.length; attempt++) {
            const remaining = deadline - Date.now();
            const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(Math.min(ATTEMPT_TIMEOUT_MS, remaining))]);
            try {
              response = await generate(plan[attempt], signal);
              break;
            } catch (err) {
              lastErr = err;
              const backoff = 1_500 * 2 ** Math.min(attempt, 2) + Math.random() * 500;
              // A per-attempt timeout is retryable; the overall deadline / client disconnect is not.
              const attemptTimedOut = signal.aborted && !controller.signal.aborted;
              const canRetry =
                (attemptTimedOut || isTransientAiError(err)) &&
                !controller.signal.aborted &&
                Date.now() + backoff < deadline - 10_000;
              if (!canRetry || attempt === plan.length - 1) throw err;
              console.warn(`Gemini attempt ${attempt + 1} (${plan[attempt]}) failed transiently; retrying in ${Math.round(backoff)}ms`);
              await sleep(backoff);
            }
          }
        } finally {
          clearTimeout(abortTimer);
        }
        if (!response) throw lastErr;

        const jsonText = response.text || '{}';
        const parsedData = JSON.parse(jsonText);
        if (!res.headersSent) res.json({ success: true, data: parsedData });
      } catch (err: unknown) {
        console.error('Error generating schema:', sanitizeErrorMessage(err));
        const { status, message } = friendlyAiError(err);
        if (!res.headersSent) res.status(status).json({ error: message });
      }
    },
  );

  // Vite dev middleware vs static build serve
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`SchemaFlow backend active on http://0.0.0.0:${PORT}`);
  });

  // Low-resource environment connection and socket timeouts (512MB RAM / 0.1 CPU)
  server.timeout = 15_000;         // Inactive socket timeout
  server.keepAliveTimeout = 5_000; // Keep-alive socket timeout
  server.headersTimeout = 6_000;   // Headers timeout (must exceed keepAliveTimeout)
  if ('requestTimeout' in server) {
    (server as any).requestTimeout = 15_000; // Overall request reception timeout
  }

  // Graceful termination handlers
  const shutdown = () => {
    server.close(() => {
      process.exit(0);
    });
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

startServer();
