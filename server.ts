import express from 'express';
import path from 'path';
import dotenv from 'dotenv';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI, Type } from '@google/genai';
import { MongoClient, ObjectId } from 'mongodb';
import { z } from 'zod';

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

/** Strict connection options with fast failover timeouts. */
const MONGO_CLIENT_OPTIONS = {
  serverSelectionTimeoutMS: 5000,
  connectTimeoutMS: 5000,
  socketTimeoutMS: 10000,
  maxPoolSize: 2,
};

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

  app.use(express.json({ limit: '1mb' }));

  // Health check
  app.get('/api/health', (_req, res) => {
    res.json({
      status: 'ok',
      service: 'SchemaFlow Core API',
      timestamp: new Date().toISOString(),
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
      try {
        await client.connect();
        const adminDb = client.db('admin');
        const dbs = await adminDb.admin().listDatabases();
        res.json({ success: true, databases: dbs.databases.map((d) => d.name) });
      } catch (err: unknown) {
        console.error('Error connecting to MongoDB:', sanitizeErrorMessage(err));
        res.status(500).json({ error: sanitizeErrorMessage(err) });
      } finally {
        await client.close().catch(() => {});
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
      try {
        await client.connect();
        const db = client.db(parsed.data.dbName);
        const collections = await db.listCollections().toArray();
        res.json({ success: true, collections: collections.map((c) => c.name) });
      } catch (err: unknown) {
        console.error('Error fetching collections:', sanitizeErrorMessage(err));
        res.status(500).json({ error: sanitizeErrorMessage(err) });
      } finally {
        await client.close().catch(() => {});
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
        await client.close().catch(() => {});
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

        const response = await ai.models.generateContent({
          model: 'gemini-2.5-flash',
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

        const jsonText = response.text || '{}';
        const parsedData = JSON.parse(jsonText);
        res.json({ success: true, data: parsedData });
      } catch (err: unknown) {
        console.error('Error generating schema:', sanitizeErrorMessage(err));
        res.status(500).json({ error: sanitizeErrorMessage(err) });
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

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`SchemaFlow backend active on http://0.0.0.0:${PORT}`);
  });
}

startServer();
