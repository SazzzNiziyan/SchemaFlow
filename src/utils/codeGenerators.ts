import { CollectionNode, TargetFramework } from '../types';

export function generateMongooseCode(collections: CollectionNode[]): string {
  if (collections.length === 0) return '// No collections defined';

  let code = `import mongoose, { Schema, Document } from 'mongoose';\n\n`;

  collections.forEach((col) => {
    const schemaName = `${col.name.toLowerCase().replace(/s$/, '')}Schema`;
    const modelName = col.name.charAt(0).toUpperCase() + col.name.slice(1);

    code += `// ${col.name} Schema\n`;
    code += `export const ${schemaName} = new Schema({\n`;

    col.fields.forEach((field) => {
      if (field.isPrimaryKey && field.name === '_id') return; // Default in Mongoose

      code += `  ${field.name}: {\n`;

      if (field.isForeignKey && field.foreignKeyRef) {
        const targetCol = collections.find((c) => c.id === field.foreignKeyRef?.targetCollectionId);
        const refName = targetCol ? targetCol.name.charAt(0).toUpperCase() + targetCol.name.slice(1) : 'Object';
        code += `    type: Schema.Types.ObjectId,\n`;
        code += `    ref: '${refName}',\n`;
      } else {
        switch (field.type) {
          case 'ObjectId':
            code += `    type: Schema.Types.ObjectId,\n`;
            break;
          case 'Date':
            code += `    type: Date,\n`;
            break;
          case 'Number':
          case 'Decimal':
            code += `    type: Number,\n`;
            break;
          case 'Boolean':
            code += `    type: Boolean,\n`;
            break;
          case 'Array':
            code += `    type: [Schema.Types.Mixed],\n`;
            break;
          case 'JSON':
            code += `    type: Schema.Types.Mixed,\n`;
            break;
          default:
            code += `    type: String,\n`;
            break;
        }
      }

      if (field.validation.required) {
        code += `    required: true,\n`;
      }
      if (field.validation.unique) {
        code += `    unique: true,\n`;
      }
      if (field.validation.match) {
        code += `    match: ${field.validation.match},\n`;
      }
      if (field.validation.defaultVal) {
        if (field.type === 'Date' && field.validation.defaultVal.toLowerCase().includes('now')) {
          code += `    default: Date.now,\n`;
        } else if (field.type === 'Number' || field.type === 'Boolean') {
          code += `    default: ${field.validation.defaultVal},\n`;
        } else {
          code += `    default: '${field.validation.defaultVal}',\n`;
        }
      }

      code += `  },\n`;
    });

    code += `}, { timestamps: true });\n\n`;
    code += `export const ${modelName} = mongoose.models.${modelName} || mongoose.model('${modelName}', ${schemaName});\n\n`;
  });

  return code.trim();
}

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
        case 'UUID':
          prismaType = 'String';
          break;
        default:
          prismaType = 'String';
      }

      let line = `  ${field.name} ${prismaType}`;

      if (!field.validation.required && !field.isPrimaryKey) {
        line += `?`;
      }

      const attributes: string[] = [];

      if (field.isPrimaryKey) {
        attributes.push('@id');
        if (field.type === 'UUID') {
          attributes.push('@default(uuid())');
        } else if (field.type === 'ObjectId') {
          attributes.push('@default(auto()) @map("_id") @db.ObjectId');
        }
      }

      if (field.validation.unique) {
        attributes.push('@unique');
      }

      if (field.validation.defaultVal) {
        if (field.type === 'Date' && field.validation.defaultVal.toLowerCase().includes('now')) {
          attributes.push('@default(now())');
        } else if (field.type === 'Number' || field.type === 'Boolean') {
          attributes.push(`@default(${field.validation.defaultVal})`);
        } else {
          attributes.push(`@default("${field.validation.defaultVal}")`);
        }
      }

      if (field.isForeignKey && field.foreignKeyRef) {
        const targetCol = collections.find((c) => c.id === field.foreignKeyRef?.targetCollectionId);
        if (targetCol) {
          const refModel = targetCol.name.charAt(0).toUpperCase() + targetCol.name.slice(1);
          const targetField = targetCol.fields.find((f) => f.id === field.foreignKeyRef?.targetFieldId)?.name || 'id';
          const relFieldName = field.name.replace(/Id$/, '');
          line += `\n  ${relFieldName} ${refModel} @relation(fields: [${field.name}], references: [${targetField}])`;
        }
      }

      if (attributes.length > 0) {
        line += ` ${attributes.join(' ')}`;
      }

      code += `${line}\n`;
    });

    code += `}\n\n`;
  });

  return code.trim();
}

export function generatePostgresCode(collections: CollectionNode[]): string {
  if (collections.length === 0) return '-- No tables defined';

  let code = `-- PostgreSQL DDL Generated by SchemaForge\n\n`;

  collections.forEach((col) => {
    const tableName = col.name.toLowerCase();
    code += `CREATE TABLE "${tableName}" (\n`;

    const columnDefs: string[] = [];

    col.fields.forEach((field) => {
      let sqlType = 'VARCHAR(255)';
      switch (field.type) {
        case 'ObjectId':
        case 'UUID':
          sqlType = 'UUID';
          break;
        case 'Number':
          sqlType = 'INTEGER';
          break;
        case 'Decimal':
          sqlType = 'NUMERIC(12, 2)';
          break;
        case 'Boolean':
          sqlType = 'BOOLEAN';
          break;
        case 'Date':
          sqlType = 'TIMESTAMP WITH TIME ZONE';
          break;
        case 'JSON':
          sqlType = 'JSONB';
          break;
        default:
          sqlType = 'TEXT';
      }

      let colDef = `  "${field.name}" ${sqlType}`;

      if (field.isPrimaryKey) {
        colDef += ` PRIMARY KEY`;
        if (field.type === 'UUID') colDef += ` DEFAULT gen_random_uuid()`;
      }

      if (field.validation.required && !field.isPrimaryKey) {
        colDef += ` NOT NULL`;
      }

      if (field.validation.unique && !field.isPrimaryKey) {
        colDef += ` UNIQUE`;
      }

      if (field.validation.defaultVal) {
        if (field.type === 'Date' && field.validation.defaultVal.toLowerCase().includes('now')) {
          colDef += ` DEFAULT CURRENT_TIMESTAMP`;
        } else if (field.type === 'Number' || field.type === 'Boolean') {
          colDef += ` DEFAULT ${field.validation.defaultVal}`;
        } else {
          colDef += ` DEFAULT '${field.validation.defaultVal}'`;
        }
      }

      if (field.isForeignKey && field.foreignKeyRef) {
        const targetCol = collections.find((c) => c.id === field.foreignKeyRef?.targetCollectionId);
        if (targetCol) {
          const targetTable = targetCol.name.toLowerCase();
          const targetField = targetCol.fields.find((f) => f.id === field.foreignKeyRef?.targetFieldId)?.name || 'id';
          colDef += ` REFERENCES "${targetTable}"("${targetField}") ON DELETE CASCADE`;
        }
      }

      columnDefs.push(colDef);
    });

    code += columnDefs.join(',\n') + `\n);\n\n`;
  });

  return code.trim();
}

export function generateDrizzleCode(collections: CollectionNode[]): string {
  if (collections.length === 0) return '// No tables defined';

  let code = `import { pgTable, text, integer, boolean, timestamp, uuid, jsonb } from 'drizzle-orm/pg-core';\n\n`;

  collections.forEach((col) => {
    const tableName = col.name.toLowerCase();
    const varName = `${tableName}Table`;

    code += `export const ${varName} = pgTable('${tableName}', {\n`;

    col.fields.forEach((field) => {
      let func = `text('${field.name}')`;

      switch (field.type) {
        case 'Number':
          func = `integer('${field.name}')`;
          break;
        case 'Boolean':
          func = `boolean('${field.name}')`;
          break;
        case 'Date':
          func = `timestamp('${field.name}')`;
          break;
        case 'UUID':
        case 'ObjectId':
          func = `uuid('${field.name}')`;
          break;
        case 'JSON':
          func = `jsonb('${field.name}')`;
          break;
        default:
          func = `text('${field.name}')`;
      }

      let chained = func;
      if (field.isPrimaryKey) chained += `.primaryKey()`;
      if (field.validation.required) chained += `.notNull()`;
      if (field.validation.unique) chained += `.unique()`;
      if (field.validation.defaultVal) {
        if (field.type === 'Date') chained += `.defaultNow()`;
        else chained += `.default('${field.validation.defaultVal}')`;
      }

      code += `  ${field.name}: ${chained},\n`;
    });

    code += `});\n\n`;
  });

  return code.trim();
}

export function generateTypeScriptCode(collections: CollectionNode[]): string {
  if (collections.length === 0) return '// No types defined';

  let code = `// Auto-generated TypeScript Interface Definitions\n\n`;

  collections.forEach((col) => {
    const interfaceName = col.name.charAt(0).toUpperCase() + col.name.slice(1).replace(/s$/, '');

    code += `export interface ${interfaceName} {\n`;

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
          tsType = 'any[]';
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
  });

  return code.trim();
}

export function generateCode(collections: CollectionNode[], framework: TargetFramework): string {
  switch (framework) {
    case 'mongoose':
      return generateMongooseCode(collections);
    case 'prisma':
      return generatePrismaCode(collections);
    case 'postgres':
      return generatePostgresCode(collections);
    case 'drizzle':
      return generateDrizzleCode(collections);
    case 'typescript':
      return generateTypeScriptCode(collections);
    case 'jsonSchema':
      return JSON.stringify(
        {
          $schema: 'http://json-schema.org/draft-07/schema#',
          title: 'SchemaForge Models',
          definitions: Object.fromEntries(
            collections.map((col) => [
              col.name,
              {
                type: 'object',
                properties: Object.fromEntries(
                  col.fields.map((f) => [
                    f.name,
                    {
                      type: f.type === 'Number' ? 'number' : f.type === 'Boolean' ? 'boolean' : 'string',
                    },
                  ])
                ),
                required: col.fields.filter((f) => f.validation.required).map((f) => f.name),
              },
            ])
          ),
        },
        null,
        2
      );
    default:
      return generateMongooseCode(collections);
  }
}
