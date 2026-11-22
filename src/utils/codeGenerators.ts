import { CollectionNode, FieldType, SchemaField, TargetFramework } from '../types';
import { modelNameFor, schemaVarFor } from './naming';

const MONGOOSE_TYPE: Record<FieldType, string> = {
  String: 'String',
  Enum: 'String',
  Number: 'Number',
  Decimal: 'Schema.Types.Decimal128',
  Boolean: 'Boolean',
  Date: 'Date',
  ObjectId: 'Schema.Types.ObjectId',
  UUID: 'Schema.Types.UUID',
  JSON: 'Schema.Types.Mixed',
  Array: 'Schema.Types.Mixed',
};

const quote = (s: string) => `'${s.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
const isQuoted = (s: string) => /^(['"`])[\s\S]*\1$/.test(s.trim());

/** Renders `validation.defaultVal` as a valid JS expression for the field's type. */
function mongooseDefault(field: SchemaField): string {
  const raw = field.validation.defaultVal!.trim();
  if (isQuoted(raw)) return raw;
  if (field.type === 'Date' && /now/i.test(raw)) return 'Date.now';
  if (field.type === 'String' || field.type === 'Enum' || field.type === 'UUID') return quote(raw);
  if (field.type === 'Date' && !/^[\w$.]+(\(\))?$/.test(raw)) return quote(raw);
  return raw;
}

export interface MongooseCodeOptions {
  /**
   * Full canvas, used to resolve `ref` names when generating code for a
   * subset of collections (e.g. only the selected one). Defaults to `collections`.
   */
  allCollections?: CollectionNode[];
}

/**
 * 1. Enhanced Mongoose Schema with TypeScript Interfaces, Indexes, TTL, and Virtuals.
 *
 * The output is round-trippable through `parseMongooseCode` (see mongooseRoundTrip.test.ts).
 */
export function generateMongooseCode(collections: CollectionNode[], options: MongooseCodeOptions = {}): string {
  if (collections.length === 0) return '// No collections defined';
  const refPool = options.allCollections ?? collections;

  let code = `import mongoose, { Schema, Document, Model } from 'mongoose';\n\n`;

  collections.forEach((col) => {
    const modelName = modelNameFor(col.name);
    const schemaName = schemaVarFor(col.name);

    // TypeScript Document Interface
    code += `// ============================================================================\n`;
    code += `// ${modelName} Interface & Model\n`;
    code += `// ============================================================================\n`;
    code += `export interface I${modelName} extends Document {\n`;
    col.fields.forEach((field) => {
      let tsType = 'string';
      switch (field.type) {
        case 'Number':
          tsType = 'number';
          break;
        case 'Decimal':
          tsType = 'mongoose.Types.Decimal128';
          break;
        case 'Boolean':
          tsType = 'boolean';
          break;
        case 'Date':
          tsType = 'Date';
          break;
        case 'ObjectId':
          tsType = 'mongoose.Types.ObjectId';
          break;
        case 'Enum':
          tsType = field.validation.enumOptions?.length
            ? field.validation.enumOptions.map(quote).join(' | ')
            : 'string';
          break;
        case 'Array':
          tsType = field.array?.itemType === 'ObjectId' ? 'mongoose.Types.ObjectId[]' : 'any[]';
          break;
        case 'JSON':
          tsType = 'Record<string, any>';
          break;
        default:
          tsType = 'string';
      }
      const opt = field.validation.required || field.isPrimaryKey ? '' : '?';
      code += `  ${field.name}${opt}: ${tsType};\n`;
    });
    if (col.timestamps) {
      code += `  createdAt: Date;\n  updatedAt: Date;\n`;
    }
    code += `}\n\n`;

    // Mongoose Schema Definition
    code += `export const ${schemaName} = new Schema<I${modelName}>({\n`;

    col.fields.forEach((field) => {
      if (field.isPrimaryKey && field.name === '_id') return; // Default in Mongoose

      code += `  ${field.name}: {\n`;

      const targetCol =
        field.isForeignKey && field.foreignKeyRef
          ? refPool.find((c) => c.id === field.foreignKeyRef?.targetCollectionId)
          : undefined;

      if (targetCol) {
        const refName = modelNameFor(targetCol.name);
        if (field.type === 'Array') {
          code += `    type: [{ type: Schema.Types.ObjectId, ref: '${refName}' }],\n`;
        } else {
          code += `    type: ${MONGOOSE_TYPE[field.type]},\n`;
          code += `    ref: '${refName}',\n`;
        }
      } else if (field.type === 'Array') {
        const item = field.array?.itemType ?? 'JSON';
        code += `    type: [${item === 'Array' ? MONGOOSE_TYPE.JSON : MONGOOSE_TYPE[item]}],\n`;
      } else {
        code += `    type: ${MONGOOSE_TYPE[field.type] ?? 'String'},\n`;
      }

      const isEnum = field.type === 'Enum' || (field.type === 'Array' && field.array?.itemType === 'Enum');
      if (isEnum && field.validation.enumOptions && field.validation.enumOptions.length > 0) {
        code += `    enum: [${field.validation.enumOptions.map(quote).join(', ')}],\n`;
      }
      if (field.validation.required) {
        code += `    required: true,\n`;
      }
      if (field.validation.unique) {
        code += `    unique: true,\n`;
      }
      if (field.validation.select === false) {
        code += `    select: false,\n`;
      }
      if (field.index?.indexed && !field.validation.unique && !field.index.ttlSeconds) {
        const dir = field.index.direction;
        code += `    index: ${dir === undefined || dir === 1 ? 'true' : typeof dir === 'number' ? dir : quote(dir)},\n`;
        if (field.index.sparse) code += `    sparse: true,\n`;
      }
      if (field.validation.match) {
        code += `    match: ${field.validation.match},\n`;
      }
      const isText = field.type === 'String' || field.type === 'Enum';
      if (field.validation.min !== undefined) {
        code += `    ${isText ? 'minlength' : 'min'}: ${field.validation.min},\n`;
      }
      if (field.validation.max !== undefined) {
        code += `    ${isText ? 'maxlength' : 'max'}: ${field.validation.max},\n`;
      }
      if (field.validation.defaultVal) {
        code += `    default: ${mongooseDefault(field)},\n`;
      }

      code += `  },\n`;
    });

    const optionsStr = col.timestamps ? `{ timestamps: true }` : `{}`;
    code += `}, ${optionsStr});\n\n`;

    // TTL Indexes
    col.fields.forEach((field) => {
      if (field.index?.indexed && field.index.ttlSeconds) {
        code += `// TTL Index for automatic expiration after ${field.index.ttlSeconds}s\n`;
        code += `${schemaName}.index({ ${field.name}: 1 }, { expireAfterSeconds: ${field.index.ttlSeconds} });\n`;
      }
    });

    // Compound Indexes
    if (col.compoundIndexes && col.compoundIndexes.length > 0) {
      col.compoundIndexes.forEach((ci) => {
        const fieldsObj = ci.fields
          .map((f) => {
            const fName = col.fields.find((fld) => fld.id === f.fieldId)?.name ?? f.fieldId;
            return `${fName}: ${typeof f.direction === 'number' ? f.direction : quote(f.direction)}`;
          })
          .join(', ');
        const opts = [
          ci.unique ? 'unique: true' : '',
          ci.sparse ? 'sparse: true' : '',
          ci.name ? `name: ${quote(ci.name)}` : '',
        ].filter(Boolean);
        code += `${schemaName}.index({ ${fieldsObj} }${opts.length ? `, { ${opts.join(', ')} }` : ''});\n`;
      });
    }

    code += `export const ${modelName}: Model<I${modelName}> =\n  mongoose.models.${modelName} || mongoose.model<I${modelName}>('${modelName}', ${schemaName});\n\n`;
  });

  return code.trim();
}

/**
 * 2. Zod Validation Schemas for Request Validation (Create & Update).
 */
export function generateZodCode(collections: CollectionNode[]): string {
  if (collections.length === 0) return '// No collections defined';

  let code = `import { z } from 'zod';\n\n`;
  code += `// Helper regex for MongoDB 24-character hex ObjectId\n`;
  code += `const objectIdRegex = /^[0-9a-fA-F]{24}$/;\n`;
  code += `const zObjectId = z.string().regex(objectIdRegex, 'Invalid ObjectId');\n\n`;

  collections.forEach((col) => {
    const modelName = col.name.charAt(0).toUpperCase() + col.name.slice(1).replace(/s$/, '');

    code += `// ============================================================================\n`;
    code += `// ${modelName} Zod Schemas\n`;
    code += `// ============================================================================\n`;
    code += `export const Create${modelName}Schema = z.object({\n`;

    col.fields.forEach((field) => {
      // Exclude primary key from creation body
      if (field.isPrimaryKey && field.name === '_id') return;
      if (/^(createdAt|updatedAt)$/i.test(field.name) && col.timestamps) return;

      let validator = 'z.string()';

      switch (field.type) {
        case 'ObjectId':
          validator = 'zObjectId';
          break;
        case 'Number':
        case 'Decimal':
          validator = 'z.number()';
          if (field.validation.min !== undefined) validator += `.min(${field.validation.min})`;
          if (field.validation.max !== undefined) validator += `.max(${field.validation.max})`;
          break;
        case 'Boolean':
          validator = 'z.boolean()';
          break;
        case 'Date':
          validator = 'z.coerce.date()';
          break;
        case 'Array':
          if (field.array?.itemType === 'ObjectId') {
            validator = 'z.array(zObjectId)';
          } else {
            validator = 'z.array(z.any())';
          }
          break;
        case 'Enum':
          if (field.validation.enumOptions && field.validation.enumOptions.length > 0) {
            const opts = field.validation.enumOptions.map((o) => `'${o}'`).join(', ');
            validator = `z.enum([${opts}])`;
          } else {
            validator = 'z.string()';
          }
          break;
        case 'JSON':
          validator = 'z.record(z.any())';
          break;
        default:
          if (/email/i.test(field.name)) {
            validator = 'z.string().email()';
          } else {
            validator = 'z.string()';
            if (field.validation.min !== undefined) validator += `.min(${field.validation.min})`;
            if (field.validation.max !== undefined) validator += `.max(${field.validation.max})`;
          }
      }

      if (!field.validation.required && !field.isPrimaryKey) {
        validator += '.optional()';
      }

      code += `  ${field.name}: ${validator},\n`;
    });

    code += `});\n\n`;
    code += `export const Update${modelName}Schema = Create${modelName}Schema.partial();\n\n`;
    code += `export type Create${modelName}Input = z.infer<typeof Create${modelName}Schema>;\n`;
    code += `export type Update${modelName}Input = z.infer<typeof Update${modelName}Schema>;\n\n`;
  });

  return code.trim();
}

/**
 * 3. TypeScript Interfaces and DTOs.
 */
export function generateTypeScriptCode(collections: CollectionNode[]): string {
  if (collections.length === 0) return '// No types defined';

  let code = `// ============================================================================\n`;
  code += `// Auto-generated TypeScript Interfaces & DTOs\n`;
  code += `// ============================================================================\n\n`;

  collections.forEach((col) => {
    const modelName = col.name.charAt(0).toUpperCase() + col.name.slice(1).replace(/s$/, '');

    // Entity Interface
    code += `export interface I${modelName} {\n`;
    col.fields.forEach((field) => {
      let tsType = 'string';
      switch (field.type) {
        case 'Number':
        case 'Decimal':
          tsType = 'number';
          break;
        case 'Boolean':
          tsType = 'boolean';
          break;
        case 'Date':
          tsType = 'Date | string';
          break;
        case 'Array':
          tsType = field.array?.itemType === 'ObjectId' ? 'string[]' : 'any[]';
          break;
        case 'JSON':
          tsType = 'Record<string, any>';
          break;
        default:
          tsType = 'string';
      }

      const optional = field.validation.required || field.isPrimaryKey ? '' : '?';
      code += `  ${field.name}${optional}: ${tsType};\n`;
    });
    if (col.timestamps) {
      code += `  createdAt?: Date | string;\n  updatedAt?: Date | string;\n`;
    }
    code += `}\n\n`;

    // Create DTO (omit _id and timestamps)
    code += `export interface Create${modelName}Dto {\n`;
    col.fields.forEach((field) => {
      if (field.isPrimaryKey && field.name === '_id') return;
      if (/^(createdAt|updatedAt)$/i.test(field.name) && col.timestamps) return;

      let tsType = 'string';
      switch (field.type) {
        case 'Number':
        case 'Decimal':
          tsType = 'number';
          break;
        case 'Boolean':
          tsType = 'boolean';
          break;
        case 'Date':
          tsType = 'Date | string';
          break;
        case 'Array':
          tsType = field.array?.itemType === 'ObjectId' ? 'string[]' : 'any[]';
          break;
        case 'JSON':
          tsType = 'Record<string, any>';
          break;
        default:
          tsType = 'string';
      }
      const optional = field.validation.required ? '' : '?';
      code += `  ${field.name}${optional}: ${tsType};\n`;
    });
    code += `}\n\n`;

    // Update DTO
    code += `export interface Update${modelName}Dto extends Partial<Create${modelName}Dto> {}\n\n`;
  });

  return code.trim();
}

/**
 * 4. Express + TypeScript CRUD Controller & Router Boilerplate.
 */
export function generateExpressApiCode(collections: CollectionNode[]): string {
  if (collections.length === 0) return '// No collections defined';

  let code = `import { Router, Request, Response, NextFunction } from 'express';\n`;
  code += `import { z } from 'zod';\n\n`;

  code += `// Validation helper middleware\n`;
  code += `const validate = (schema: z.ZodSchema) => (req: Request, res: Response, next: NextFunction) => {\n`;
  code += `  const result = schema.safeParse(req.body);\n`;
  code += `  if (!result.success) {\n`;
  code += `    return res.status(400).json({ error: 'Validation failed', details: result.error.errors });\n`;
  code += `  }\n`;
  code += `  req.body = result.data;\n`;
  code += `  next();\n`;
  code += `};\n\n`;

  collections.forEach((col) => {
    const modelName = col.name.charAt(0).toUpperCase() + col.name.slice(1).replace(/s$/, '');
    const routePrefix = col.name.toLowerCase();

    code += `// ============================================================================\n`;
    code += `// ${modelName} Router (/api/${routePrefix})\n`;
    code += `// ============================================================================\n`;
    code += `export const ${modelName.toLowerCase()}Router = Router();\n\n`;

    // GET / (List with pagination)
    code += `// GET /api/${routePrefix} - List documents with pagination\n`;
    code += `${modelName.toLowerCase()}Router.get('/', async (req: Request, res: Response) => {\n`;
    code += `  try {\n`;
    code += `    const page = Math.max(1, Number(req.query.page) || 1);\n`;
    code += `    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));\n`;
    code += `    const skip = (page - 1) * limit;\n\n`;
    code += `    // In production: const [items, total] = await Promise.all([\n`;
    code += `    //   ${modelName}.find().skip(skip).limit(limit).lean(),\n`;
    code += `    //   ${modelName}.countDocuments(),\n`;
    code += `    // ]);\n`;
    code += `    res.json({ success: true, page, limit, data: [] });\n`;
    code += `  } catch (err: any) {\n`;
    code += `    res.status(500).json({ error: err.message });\n`;
    code += `  }\n`;
    code += `});\n\n`;

    // GET /:id
    code += `// GET /api/${routePrefix}/:id - Fetch single document\n`;
    code += `${modelName.toLowerCase()}Router.get('/:id', async (req: Request, res: Response) => {\n`;
    code += `  try {\n`;
    code += `    // In production: const item = await ${modelName}.findById(req.params.id).lean();\n`;
    code += `    res.json({ success: true, id: req.params.id });\n`;
    code += `  } catch (err: any) {\n`;
    code += `    res.status(500).json({ error: err.message });\n`;
    code += `  }\n`;
    code += `});\n\n`;

    // POST / (Create)
    code += `// POST /api/${routePrefix} - Create new document\n`;
    code += `${modelName.toLowerCase()}Router.post('/', async (req: Request, res: Response) => {\n`;
    code += `  try {\n`;
    code += `    // In production: const created = await ${modelName}.create(req.body);\n`;
    code += `    res.status(201).json({ success: true, data: req.body });\n`;
    code += `  } catch (err: any) {\n`;
    code += `    res.status(500).json({ error: err.message });\n`;
    code += `  }\n`;
    code += `});\n\n`;

    // PUT /:id (Update)
    code += `// PUT /api/${routePrefix}/:id - Update document\n`;
    code += `${modelName.toLowerCase()}Router.put('/:id', async (req: Request, res: Response) => {\n`;
    code += `  try {\n`;
    code += `    // In production: const updated = await ${modelName}.findByIdAndUpdate(req.params.id, req.body, { new: true });\n`;
    code += `    res.json({ success: true, id: req.params.id, data: req.body });\n`;
    code += `  } catch (err: any) {\n`;
    code += `    res.status(500).json({ error: err.message });\n`;
    code += `  }\n`;
    code += `});\n\n`;

    // DELETE /:id
    code += `// DELETE /api/${routePrefix}/:id - Delete document\n`;
    code += `${modelName.toLowerCase()}Router.delete('/:id', async (req: Request, res: Response) => {\n`;
    code += `  try {\n`;
    code += `    // In production: await ${modelName}.findByIdAndDelete(req.params.id);\n`;
    code += `    res.json({ success: true, deleted: req.params.id });\n`;
    code += `  } catch (err: any) {\n`;
    code += `    res.status(500).json({ error: err.message });\n`;
    code += `  }\n`;
    code += `});\n\n`;
  });

  return code.trim();
}

/**
 * 5. MongoDB Native $jsonSchema Validator & Migration Script.
 */
export function generateJsonSchemaCode(collections: CollectionNode[]): string {
  if (collections.length === 0) return '// No collections defined';

  let code = `// MongoDB Shell Schema Validation & Index Migration Script\n`;
  code += `// Run in mongosh or MongoDB Compass\n\n`;

  collections.forEach((col) => {
    const colName = col.name.toLowerCase();

    const requiredFields = col.fields
      .filter((f) => f.validation.required && f.name !== '_id')
      .map((f) => `'${f.name}'`);

    code += `// ----------------------------------------------------------------------------\n`;
    code += `// Collection: ${colName}\n`;
    code += `// ----------------------------------------------------------------------------\n`;
    code += `db.createCollection('${colName}', {\n`;
    code += `  validator: {\n`;
    code += `    $jsonSchema: {\n`;
    code += `      bsonType: 'object',\n`;
    if (requiredFields.length > 0) {
      code += `      required: [${requiredFields.join(', ')}],\n`;
    }
    code += `      properties: {\n`;

    col.fields.forEach((field) => {
      let bsonType = 'string';
      switch (field.type) {
        case 'ObjectId':
          bsonType = 'objectId';
          break;
        case 'Number':
        case 'Decimal':
          bsonType = 'number';
          break;
        case 'Boolean':
          bsonType = 'bool';
          break;
        case 'Date':
          bsonType = 'date';
          break;
        case 'Array':
          bsonType = 'array';
          break;
        case 'JSON':
          bsonType = 'object';
          break;
        default:
          bsonType = 'string';
      }

      code += `        ${field.name}: {\n`;
      code += `          bsonType: '${bsonType}',\n`;
      code += `          description: 'must be a ${bsonType}${field.validation.required ? ' and is required' : ''}',\n`;
      if (field.validation.match) {
        code += `          pattern: '${field.validation.match.replace(/^\/|\/[a-z]*$/g, '')}',\n`;
      }
      code += `        },\n`;
    });

    code += `      }\n`;
    code += `    }\n`;
    code += `  }\n`;
    code += `});\n\n`;

    // Generate Index Creation Statements
    col.fields.forEach((field) => {
      if (field.name === '_id') return;

      if (field.validation.unique) {
        code += `db.${colName}.createIndex({ ${field.name}: 1 }, { unique: true });\n`;
      } else if (field.index?.indexed && field.index.ttlSeconds) {
        code += `db.${colName}.createIndex({ ${field.name}: 1 }, { expireAfterSeconds: ${field.index.ttlSeconds} });\n`;
      } else if (field.index?.indexed || field.isForeignKey) {
        code += `db.${colName}.createIndex({ ${field.name}: 1 });\n`;
      }
    });

    if (col.compoundIndexes && col.compoundIndexes.length > 0) {
      col.compoundIndexes.forEach((ci) => {
        const fieldsObj = ci.fields
          .map((f) => {
            const fName = col.fields.find((fld) => fld.id === f.fieldId)?.name ?? f.fieldId;
            return `${fName}: ${f.direction}`;
          })
          .join(', ');
        const optUnique = ci.unique ? `, { unique: true }` : '';
        code += `db.${colName}.createIndex({ ${fieldsObj} }${optUnique});\n`;
      });
    }

    code += `\n`;
  });

  return code.trim();
}

/**
 * 6. Realistic Mock Document Generator based on domain field heuristics.
 */
export function generateMockDocuments(
  collections: CollectionNode[],
  count = 3,
): Record<string, any[]> {
  const result: Record<string, any[]> = {};
  const generatedIdsByCol: Record<string, string[]> = {};

  // First pass: generate IDs
  collections.forEach((col) => {
    generatedIdsByCol[col.id] = Array.from({ length: count }, (_, i) => {
      const hex = (col.name.slice(0, 3) + i).padEnd(6, '0');
      return `507f1f77bcf86cd799${hex.slice(0, 6)}`;
    });
  });

  const SAMPLE_NAMES = ['Sarah Connor', 'Alex Mercer', 'David Chen', 'Elena Rostova', 'Marcus Vance'];
  const SAMPLE_EMAILS = ['sarah.dev@example.com', 'alex.m@cloudcorp.io', 'david@hexastack.org', 'elena@vortex.dev'];
  const SAMPLE_TITLES = [
    'Building Distributed Systems with Go',
    'Optimizing MongoDB Indexes for Scale',
    'Architecture Decisions for High-Concurrency',
    'Full-Stack TypeScript Engineering',
  ];
  const SAMPLE_TAGS = ['database', 'architecture', 'performance', 'typescript', 'mongodb'];

  collections.forEach((col) => {
    const docs: any[] = [];
    const ids = generatedIdsByCol[col.id];

    for (let i = 0; i < count; i++) {
      const doc: Record<string, any> = {};

      col.fields.forEach((field) => {
        const nameLower = field.name.toLowerCase();

        if (field.isPrimaryKey) {
          doc[field.name] = ids[i];
          return;
        }

        // Foreign keys referencing other collections
        if (field.isForeignKey && field.foreignKeyRef) {
          const parentIds = generatedIdsByCol[field.foreignKeyRef.targetCollectionId];
          if (parentIds && parentIds.length > 0) {
            doc[field.name] = parentIds[i % parentIds.length];
            return;
          }
        }

        // Domain-specific realistic values
        if (/email/i.test(nameLower)) {
          doc[field.name] = SAMPLE_EMAILS[i % SAMPLE_EMAILS.length];
        } else if (/username|handle/i.test(nameLower)) {
          doc[field.name] = `user_${i + 1}`;
        } else if (/password/i.test(nameLower)) {
          doc[field.name] = '$2b$10$EixZaYVK1fsbw1ZfbX3OXePaWxn96p36WQoeG6Lruj3vjPGga31lW'; // sample bcrypt
        } else if (/title|heading/i.test(nameLower)) {
          doc[field.name] = SAMPLE_TITLES[i % SAMPLE_TITLES.length];
        } else if (/name/i.test(nameLower)) {
          doc[field.name] = SAMPLE_NAMES[i % SAMPLE_NAMES.length];
        } else if (/price|cost|amount/i.test(nameLower)) {
          doc[field.name] = Number((19.99 + i * 15.5).toFixed(2));
        } else if (/status/i.test(nameLower)) {
          doc[field.name] = i === 0 ? 'active' : i === 1 ? 'pending' : 'completed';
        } else if (/role/i.test(nameLower)) {
          doc[field.name] = i === 0 ? 'admin' : 'member';
        } else if (/avatar|image|url|photo/i.test(nameLower)) {
          doc[field.name] = `https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150`;
        } else if (field.type === 'Date') {
          const pastDate = new Date(Date.now() - (count - i) * 86400000);
          doc[field.name] = pastDate.toISOString();
        } else if (field.type === 'Boolean') {
          doc[field.name] = i % 2 === 0;
        } else if (field.type === 'Number' || field.type === 'Decimal') {
          doc[field.name] = (i + 1) * 10;
        } else if (field.type === 'Array') {
          doc[field.name] = [SAMPLE_TAGS[i % SAMPLE_TAGS.length], SAMPLE_TAGS[(i + 1) % SAMPLE_TAGS.length]];
        } else if (field.type === 'JSON') {
          doc[field.name] = { version: '1.0', verified: true, meta: `seed_${i}` };
        } else {
          doc[field.name] = `${field.name}_sample_${i + 1}`;
        }
      });

      if (col.timestamps && !doc.createdAt) {
        doc.createdAt = new Date().toISOString();
        doc.updatedAt = new Date().toISOString();
      }

      docs.push(doc);
    }

    result[col.name] = docs;
  });

  return result;
}

export function generateMockDataCode(collections: CollectionNode[]): string {
  const docs = generateMockDocuments(collections, 2);
  return JSON.stringify(docs, null, 2);
}

/**
 * 7. Interactive $lookup Aggregation Pipeline Generator.
 */
export interface AggregationResult {
  pipelineCode: string;
  indexRecommendation: string;
  simulatedOutput: string;
}

export function generateAggregationPipeline(
  collections: CollectionNode[],
  sourceColId?: string,
  targetColId?: string,
): AggregationResult {
  if (collections.length === 0) {
    return {
      pipelineCode: '// No collections defined',
      indexRecommendation: '// Define collections first',
      simulatedOutput: '[]',
    };
  }

  // Find a relationship
  let relCol = collections.find((c) =>
    c.fields.some(
      (f) =>
        f.isForeignKey &&
        f.foreignKeyRef &&
        (!sourceColId || c.id === sourceColId) &&
        (!targetColId || f.foreignKeyRef.targetCollectionId === targetColId),
    ),
  );

  // Fallback to first foreign key in schema
  if (!relCol) {
    relCol = collections.find((c) => c.fields.some((f) => f.isForeignKey && f.foreignKeyRef));
  }

  if (!relCol) {
    return {
      pipelineCode: `// Connect two collections on the canvas to generate an aggregation pipeline.\n// Example:\n// db.posts.aggregate([\n//   { $lookup: { from: 'users', localField: 'authorId', foreignField: '_id', as: 'author' } }\n// ])`,
      indexRecommendation: '// Add foreign keys between collections to see index recommendations',
      simulatedOutput: '[]',
    };
  }

  const fkField = relCol.fields.find((f) => f.isForeignKey && f.foreignKeyRef)!;
  const parentCol = collections.find((c) => c.id === fkField.foreignKeyRef?.targetCollectionId);
  const parentPk = parentCol?.fields.find((f) => f.id === fkField.foreignKeyRef?.targetFieldId) ?? parentCol?.fields[0];

  const childColName = relCol.name.toLowerCase();
  const parentColName = parentCol ? parentCol.name.toLowerCase() : 'parent';
  const asField = parentCol ? parentCol.name.toLowerCase().replace(/s$/, '') : 'details';
  const isOneToOne = fkField.foreignKeyRef?.relationType === 'one-to-one';

  let pipelineCode = `// MongoDB Aggregation Pipeline: ${relCol.name} → ${parentCol?.name ?? 'Parent'}\n`;
  pipelineCode += `db.${childColName}.aggregate([\n`;
  pipelineCode += `  // Stage 1: Optional match filter\n`;
  pipelineCode += `  { $match: {} },\n\n`;
  pipelineCode += `  // Stage 2: Join with parent ${parentCol?.name}\n`;
  pipelineCode += `  {\n`;
  pipelineCode += `    $lookup: {\n`;
  pipelineCode += `      from: '${parentColName}',\n`;
  pipelineCode += `      localField: '${fkField.name}',\n`;
  pipelineCode += `      foreignField: '${parentPk?.name ?? '_id'}',\n`;
  pipelineCode += `      as: '${asField}',\n`;
  pipelineCode += `    },\n`;
  pipelineCode += `  },\n\n`;

  if (isOneToOne) {
    pipelineCode += `  // Stage 3: Flatten 1:1 joined array into single object\n`;
    pipelineCode += `  {\n`;
    pipelineCode += `    $unwind: {\n`;
    pipelineCode += `      path: '$${asField}',\n`;
    pipelineCode += `      preserveNullAndEmptyArrays: true,\n`;
    pipelineCode += `    },\n`;
    pipelineCode += `  },\n\n`;
  }

  pipelineCode += `  // Stage 4: Projection to shape output payload\n`;
  pipelineCode += `  {\n`;
  pipelineCode += `    $project: {\n`;
  relCol.fields.slice(0, 4).forEach((f) => {
    pipelineCode += `      ${f.name}: 1,\n`;
  });
  pipelineCode += `      ${asField}: 1,\n`;
  pipelineCode += `    },\n`;
  pipelineCode += `  },\n`;
  pipelineCode += `]);\n`;

  const indexRecommendation = `// Required Index for 0 COLLSCAN Performance:\ndb.${childColName}.createIndex({ ${fkField.name}: 1 });\n// Guarantees IXSCAN during $lookup joins.`;

  // Simulate output
  const mockDocs = generateMockDocuments(collections, 2);
  const childDocs = mockDocs[relCol.name] ?? [];
  const parentDocs = parentCol ? mockDocs[parentCol.name] ?? [] : [];

  const simulated = childDocs.map((cDoc) => {
    const matchedParent = parentDocs.find((pDoc) => pDoc._id === cDoc[fkField.name]);
    return {
      ...cDoc,
      [asField]: isOneToOne ? matchedParent ?? null : matchedParent ? [matchedParent] : [],
    };
  });

  return {
    pipelineCode,
    indexRecommendation,
    simulatedOutput: JSON.stringify(simulated, null, 2),
  };
}

/**
 * 8. Legacy generators preserved for full backward compatibility.
 */
export function generatePrismaCode(collections: CollectionNode[]): string {
  if (collections.length === 0) return '// No models defined';

  let code = `datasource db {\n  provider = "postgresql"\n  url      = env("DATABASE_URL")\n}\n\ngenerator client {\n  provider = "prisma-client-js"\n}\n\n`;

  collections.forEach((col) => {
    const modelName = col.name.charAt(0).toUpperCase() + col.name.slice(1);
    code += `model ${modelName} {\n`;

    col.fields.forEach((field) => {
      let prismaType = 'String';
      switch (field.type) {
        case 'ObjectId':
        case 'UUID':
          prismaType = 'String';
          break;
        case 'Number':
          prismaType = 'Int';
          break;
        case 'Decimal':
          prismaType = 'Float';
          break;
        case 'Boolean':
          prismaType = 'Boolean';
          break;
        case 'Date':
          prismaType = 'DateTime';
          break;
        case 'JSON':
          prismaType = 'Json';
          break;
        default:
          prismaType = 'String';
      }

      let line = `  ${field.name} ${prismaType}`;
      if (!field.validation.required && !field.isPrimaryKey) line += `?`;
      if (field.isPrimaryKey) line += ` @id @default(auto()) @map("_id") @db.ObjectId`;

      code += `${line}\n`;
    });

    code += `}\n\n`;
  });

  return code.trim();
}

export function generatePostgresCode(collections: CollectionNode[]): string {
  if (collections.length === 0) return '-- No tables defined';

  let code = `-- PostgreSQL DDL\n\n`;
  collections.forEach((col) => {
    const tableName = col.name.toLowerCase();
    code += `CREATE TABLE "${tableName}" (\n`;
    const colDefs = col.fields.map((f) => {
      let type = f.type === 'Number' ? 'INTEGER' : f.type === 'Boolean' ? 'BOOLEAN' : 'TEXT';
      if (f.isPrimaryKey) type += ' PRIMARY KEY';
      return `  "${f.name}" ${type}`;
    });
    code += colDefs.join(',\n') + `\n);\n\n`;
  });
  return code.trim();
}

export function generateDrizzleCode(collections: CollectionNode[]): string {
  if (collections.length === 0) return '// No tables defined';
  let code = `import { pgTable, text, integer, boolean } from 'drizzle-orm/pg-core';\n\n`;
  collections.forEach((col) => {
    const tableName = col.name.toLowerCase();
    code += `export const ${tableName} = pgTable('${tableName}', {\n`;
    col.fields.forEach((f) => {
      code += `  ${f.name}: text('${f.name}'),\n`;
    });
    code += `});\n\n`;
  });
  return code.trim();
}

export function generateCode(collections: CollectionNode[], framework: TargetFramework): string {
  switch (framework) {
    case 'mongoose':
      return generateMongooseCode(collections);
    case 'typescript':
      return generateTypeScriptCode(collections);
    case 'prisma':
      return generatePrismaCode(collections);
    case 'postgres':
      return generatePostgresCode(collections);
    case 'drizzle':
      return generateDrizzleCode(collections);
    case 'jsonSchema':
      return generateJsonSchemaCode(collections);
    default:
      return generateMongooseCode(collections);
  }
}
