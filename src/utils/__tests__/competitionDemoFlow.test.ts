import { describe, it, expect } from 'vitest';
import JSZip from 'jszip';
import { getTemplate } from '../templates';
import { auditSchema } from '../schemaAuditor';
import { applyAutoFix } from '../schemaAutoFix';
import { layoutCollections } from '../autoLayout';
import {
  generateMongooseCode,
  generateZodCode,
  generateTypeScriptCode,
  generateExpressApiCode,
  generateJsonSchemaCode,
  generateAggregationPipeline,
} from '../codeGenerators';

describe('End-to-End Competition Demo QA Flow', () => {
  it('Step 1: Initial load with Multi-Tenant SaaS default blueprint', () => {
    const saas = getTemplate('saas');
    expect(saas).toHaveLength(5);
    const audit = auditSchema(saas);
    expect(audit.score).toBe(70);
    expect(audit.issues.length).toBeGreaterThanOrEqual(3);

    const unbounded = audit.issues.find((i) => i.ruleCode === 'UNBOUNDED_ARRAY');
    expect(unbounded).toBeDefined();
    expect(unbounded?.collectionId).toBe('col_saas_projects');
  });

  it('Step 2: Open Schema Auditor and click 1-Click Fix on Unbounded Array', () => {
    const saas = getTemplate('saas');
    const initialAudit = auditSchema(saas);
    const unbounded = initialAudit.issues.find((i) => i.ruleCode === 'UNBOUNDED_ARRAY')!;

    const fixResult = applyAutoFix(unbounded, saas);
    expect(fixResult.nextCollections).toHaveLength(6);

    const extracted = fixResult.nextCollections.find((c) => c.name === 'Comments');
    expect(extracted).toBeDefined();

    const fk = extracted?.fields.find((f) => f.isForeignKey);
    expect(fk?.index?.indexed).toBe(true);

    const updatedAudit = auditSchema(fixResult.nextCollections);
    expect(updatedAudit.score).toBeGreaterThan(initialAudit.score);
    expect(updatedAudit.issues.some((i) => i.ruleCode === 'UNBOUNDED_ARRAY')).toBe(false);
  });

  it('Step 3: Load E-Commerce template and arrange layout', () => {
    const ecommerce = getTemplate('ecommerce');
    expect(ecommerce).toHaveLength(5);
    const arranged = layoutCollections(ecommerce);
    expect(arranged).toHaveLength(5);
    for (const col of arranged) {
      expect(col.position.x).toBeGreaterThanOrEqual(0);
      expect(col.position.y).toBeGreaterThanOrEqual(0);
    }
  });

  it('Step 4: Click node field & verify Code Drawer line matching', () => {
    const ecommerce = getTemplate('ecommerce');
    const productsCol = ecommerce.find((c) => c.name === 'Products')!;
    const skuField = productsCol.fields.find((f) => f.name === 'sku')!;

    const mongooseCode = generateMongooseCode([productsCol]);
    const lines = mongooseCode.split('\n');
    const regex = new RegExp(`\\b${skuField.name}\\b\\s*[:(]`, 'i');
    const matchedLineIndex = lines.findIndex((line) => regex.test(line));

    expect(matchedLineIndex).toBeGreaterThan(-1);
    expect(lines[matchedLineIndex]).toContain('sku:');
  });

  it('Step 5: Inspect Query Sandbox $lookup output for Orders -> Users', () => {
    const ecommerce = getTemplate('ecommerce');
    const sandbox = generateAggregationPipeline(ecommerce, 'col_eco_orders', 'col_eco_users');

    expect(sandbox.pipelineCode).toContain('db.orders.aggregate([');
    expect(sandbox.pipelineCode).toContain('$lookup: {');
    expect(sandbox.pipelineCode).toContain("from: 'users'");
    expect(sandbox.pipelineCode).toContain("localField: 'userId'");
    expect(sandbox.pipelineCode).toContain('$project: {');

    expect(sandbox.indexRecommendation).toContain('db.orders.createIndex({ userId: 1 });');
    expect(sandbox.indexRecommendation).toContain('Guarantees IXSCAN');
  });

  it('Step 6: Export Full-Stack Project ZIP bundle', async () => {
    const ecommerce = getTemplate('ecommerce');
    const zip = new JSZip();

    // 1. Models
    const modelsFolder = zip.folder('src/models');
    ecommerce.forEach((col) => {
      const code = generateMongooseCode([col]);
      modelsFolder?.file(`${col.name}.ts`, code);
    });

    // 2. Validators
    const zodCode = generateZodCode(ecommerce);
    zip.file('src/validators/schemas.ts', zodCode);

    // 3. Types
    const tsCode = generateTypeScriptCode(ecommerce);
    zip.file('src/types/index.ts', tsCode);

    // 4. API routes
    const expressCode = generateExpressApiCode(ecommerce);
    zip.file('src/routes/api.ts', expressCode);

    // 5. Native migrations
    const jsonSchemaCode = generateJsonSchemaCode(ecommerce);
    zip.file('scripts/migrate-indexes.js', jsonSchemaCode);

    const content = await zip.generateAsync({ type: 'nodebuffer' });
    expect(content.length).toBeGreaterThan(1000);
  });
});
