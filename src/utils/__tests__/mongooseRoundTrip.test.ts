import { describe, it, expect } from 'vitest';
import { generateMongooseCode } from '../codeGenerators';
import { parseMongooseCode } from '../mongooseParser';
import { BLUEPRINTS, getTemplate } from '../templates';
import { namesMatch } from '../naming';
import type { CollectionNode } from '../../types';

/** Drops `undefined` / `false` / empty values so semantically equal schemas compare equal. */
function canonical<T>(value: T): T {
  if (Array.isArray(value)) return value.map(canonical) as T;
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      if (v === undefined || v === false || (Array.isArray(v) && v.length === 0)) continue;
      out[k] = canonical(v);
    }
    return out as T;
  }
  return value;
}

/** Canonical form + legacy default (`relationType` absent ⇒ one-to-many). */
function normalize(cols: CollectionNode[]) {
  return canonical(
    cols.map((c) => ({
      ...c,
      fields: c.fields.map((f) =>
        f.foreignKeyRef ? { ...f, foreignKeyRef: { relationType: 'one-to-many', ...f.foreignKeyRef } } : f,
      ),
    })),
  );
}

describe('Mongoose round-trip: parse(generate(collections))', () => {
  const templates = BLUEPRINTS.map((b) => b.id);

  it.each(templates)('%s blueprint round-trips losslessly against the canvas', (id) => {
    const original = getTemplate(id);
    const code = generateMongooseCode(original);
    const result = parseMongooseCode(code, original);

    expect(result.error).toBeUndefined();
    expect(result.success).toBe(true);
    expect(result.warnings).toEqual([]);
    expect(normalize(result.collections!)).toEqual(normalize(original));
    // Idempotent: regenerating from the parsed schema yields identical code.
    expect(generateMongooseCode(result.collections!)).toBe(code);
  });

  it.each(templates)('%s blueprint parses from scratch (no canvas) with all fields, flags and refs', (id) => {
    const original = getTemplate(id);
    const result = parseMongooseCode(generateMongooseCode(original));

    expect(result.success).toBe(true);
    expect(result.warnings).toEqual([]);
    const parsed = result.collections!;
    expect(parsed).toHaveLength(original.length);

    original.forEach((col, i) => {
      const p = parsed[i];
      expect(namesMatch(p.name, col.name)).toBe(true);
      expect(p.fields.map((f) => f.name)).toEqual(col.fields.map((f) => f.name));
      col.fields.forEach((f, j) => {
        const pf = p.fields[j];
        expect(pf.type).toBe(f.type);
        expect(!!pf.isPrimaryKey).toBe(!!f.isPrimaryKey);
        expect(!!pf.validation.required).toBe(!!f.validation.required);
        expect(!!pf.validation.unique).toBe(!!f.validation.unique);
        expect(pf.validation.select).toBe(f.validation.select);
        expect(pf.validation.enumOptions).toEqual(f.validation.enumOptions);
        expect(pf.validation.min).toBe(f.validation.min);
        expect(pf.validation.max).toBe(f.validation.max);
        expect(pf.validation.match).toBe(f.validation.match);
        expect(!!pf.isForeignKey).toBe(!!f.isForeignKey);
        if (f.foreignKeyRef) {
          const target = original.find((c) => c.id === f.foreignKeyRef!.targetCollectionId)!;
          const parsedTarget = parsed.find((c) => c.id === pf.foreignKeyRef!.targetCollectionId)!;
          expect(namesMatch(parsedTarget.name, target.name)).toBe(true);
          expect(pf.foreignKeyRef!.relationType).toBe(f.foreignKeyRef.relationType ?? 'one-to-many');
        }
      });
    });
  });

  it('round-trips a single collection viewed in isolation (refs resolve against the full canvas)', () => {
    const all = getTemplate('ecommerce');
    const orders = all.find((c) => c.name === 'Orders')!;
    const code = generateMongooseCode([orders], { allCollections: all });
    expect(code).toContain("ref: 'User'");

    const result = parseMongooseCode(code, all);
    expect(result.success).toBe(true);
    expect(result.collections).toHaveLength(1);
    expect(normalize(result.collections!)).toEqual(normalize([orders]));
  });

  it('round-trips every field type, array item type, index kind and option', () => {
    const cols: CollectionNode[] = [
      {
        id: 'c_a', name: 'Categories', icon: 'Box', colorTag: '#000', position: { x: 1, y: 2 }, timestamps: true,
        compoundIndexes: [{ id: 'ci', fields: [{ fieldId: 'a2', direction: 'text' }, { fieldId: 'a3', direction: -1 }], unique: true, name: 'by_title' }],
        fields: [
          { id: 'a1', name: '_id', type: 'ObjectId', isPrimaryKey: true, validation: { required: true } },
          { id: 'a2', name: 'title', type: 'String', validation: { required: true, min: 2, max: 80, defaultVal: 'Untitled' } },
          { id: 'a3', name: 'price', type: 'Decimal', validation: { min: 0 } },
          { id: 'a4', name: 'sku', type: 'UUID', validation: { unique: true } },
          { id: 'a5', name: 'tags', type: 'Array', array: { itemType: 'String' }, validation: {} },
          { id: 'a6', name: 'scores', type: 'Array', array: { itemType: 'Number' }, validation: {} },
          { id: 'a7', name: 'meta', type: 'JSON', validation: {} },
          { id: 'a8', name: 'expiresAt', type: 'Date', index: { indexed: true, ttlSeconds: 3600 }, validation: {} },
          { id: 'a9', name: 'rank', type: 'Number', index: { indexed: true, direction: -1, sparse: true }, validation: { defaultVal: '0' } },
          { id: 'a10', name: 'parentIds', type: 'Array', array: { itemType: 'ObjectId', itemRefCollectionId: 'c_a' }, isForeignKey: true, foreignKeyRef: { targetCollectionId: 'c_a', targetFieldId: 'a1', relationType: 'many-to-many' }, validation: {} },
          { id: 'a11', name: 'kind', type: 'Enum', validation: { enumOptions: ["it's", 'b'], defaultVal: 'b' } },
          { id: 'a12', name: 'active', type: 'Boolean', validation: { defaultVal: 'true' } },
        ],
      },
    ];
    const code = generateMongooseCode(cols);
    const result = parseMongooseCode(code, cols);
    expect(result.success).toBe(true);
    expect(result.warnings).toEqual([]);
    expect(normalize(result.collections!)).toEqual(normalize(cols));
    expect(code).toContain("ref: 'Category'");
  });
});

describe('Mongoose parser: hand-written JS / TS', () => {
  it('parses TS generics, annotations, model<T>() names, options and trailing indexes', () => {
    const code = `
      import mongoose, { Schema, model, Types } from 'mongoose';

      interface IUser { email: string; org: Types.ObjectId }
      type UserModel = mongoose.Model<IUser>;

      const OrgSchema = new mongoose.Schema({ name: String }, { collection: 'organizations' });

      export const UserSchema: Schema<IUser> = new Schema<IUser, UserModel>({
        email: { type: String, required: [true, 'Email is required'], unique: true, lowercase: true, match: /^\\S+@\\S+$/ },
        org: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', index: true }, // "}" in a comment
        /* role: { type: String } */
        role: { type: String, enum: { values: ['admin', 'member'], message: '{VALUE} is invalid' }, default: "member" },
        tags: [String],
        balance: Schema.Types.Decimal128,
        profile: Schema.Types.Mixed,
        password: { type: String, select: false, minlength: 8 },
        createdBy: Types.ObjectId,
        nickname: { type: String, default: () => 'anon' },
      }, { timestamps: true });

      UserSchema.index({ email: 1, org: -1 }, { unique: true });
      UserSchema.index({ createdAt: 1 }, { expireAfterSeconds: 86400 });

      export const User = model<IUser>('Member', UserSchema);
      export const Org = mongoose.model('Organization', OrgSchema);
    `;
    const result = parseMongooseCode(code);
    expect(result.error).toBeUndefined();
    const [org, user] = result.collections!;
    expect(org.name).toBe('Organization');
    expect(user.name).toBe('Member'); // model() name wins over the variable name
    expect(user.timestamps).toBe(true);

    const f = (name: string) => user.fields.find((x) => x.name === name)!;
    expect(user.fields.map((x) => x.name)).toEqual([
      '_id', 'email', 'org', 'role', 'tags', 'balance', 'profile', 'password', 'createdBy', 'nickname',
    ]);
    expect(f('email').validation).toMatchObject({ required: true, unique: true, match: '/^\\S+@\\S+$/' });
    expect(f('org').foreignKeyRef).toMatchObject({ targetCollectionId: org.id, relationType: 'one-to-many' });
    expect(f('org').index?.indexed).toBe(true);
    expect(f('role').type).toBe('Enum');
    expect(f('role').validation).toMatchObject({ enumOptions: ['admin', 'member'], defaultVal: "'member'" });
    expect(f('tags')).toMatchObject({ type: 'Array', array: { itemType: 'String' } });
    expect(f('balance').type).toBe('Decimal');
    expect(f('profile').type).toBe('JSON');
    expect(f('password').validation).toMatchObject({ select: false, min: 8 });
    expect(f('createdBy').type).toBe('ObjectId');
    expect(f('nickname').validation.defaultVal).toBe("() => 'anon'");
    expect(user.compoundIndexes).toHaveLength(1);
    expect(user.compoundIndexes![0]).toMatchObject({ unique: true });
    expect(result.warnings).toEqual([
      expect.objectContaining({ message: expect.stringContaining('"createdAt"') }), // implicit timestamp path
    ]);
    expect(result.stats).toEqual({ collections: 2, fields: 10, relationships: 1 });
  });

  it('parses plain CommonJS with inline model schemas, arrays of refs and sub-documents', () => {
    const code = `
      const mongoose = require('mongoose')
      const { Schema } = mongoose

      const addressSchema = new Schema({ street: String, city: { type: String, required: true } }, { _id: false })

      mongoose.model('Product', new Schema({ title: String, price: { type: Number, min: 0 } }))

      const orderSchema = new Schema({
        customer: { type: Schema.Types.ObjectId, ref: 'users', required: true, unique: true },
        items: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Product' }],
        lines: [{ name: String, qty: Number }],
        shipping: addressSchema,
        notes: { text: String, pinned: Boolean },
        placedAt: { type: Date, default: Date.now, expires: '30d' },
      })

      module.exports = mongoose.model('Order', orderSchema)
    `;
    const existing: CollectionNode[] = [
      {
        id: 'col_users', name: 'Users', icon: 'Users', colorTag: '#111', position: { x: 10, y: 20 },
        fields: [{ id: 'u_pk', name: '_id', type: 'ObjectId', isPrimaryKey: true, validation: { required: true } }],
      },
    ];
    const result = parseMongooseCode(code, existing);
    expect(result.error).toBeUndefined();
    expect(result.collections!.map((c) => c.name)).toEqual(['Product', 'Order']); // addressSchema is embedded
    const [product, order] = result.collections!;
    const f = (name: string) => order.fields.find((x) => x.name === name)!;

    expect(f('customer').foreignKeyRef).toEqual({ targetCollectionId: 'col_users', targetFieldId: 'u_pk', relationType: 'one-to-one' });
    expect(f('items')).toMatchObject({ type: 'Array', array: { itemType: 'ObjectId', itemRefCollectionId: product.id } });
    expect(f('items').foreignKeyRef?.relationType).toBe('many-to-many');
    expect(f('lines')).toMatchObject({ type: 'Array', array: { itemType: 'JSON' } });
    expect(f('lines').nested?.fields.map((x) => x.name)).toEqual(['name', 'qty']);
    expect(f('shipping').type).toBe('JSON');
    expect(f('shipping').nested?.fields.map((x) => x.name)).toEqual(['street', 'city']);
    expect(f('notes').nested?.fields.map((x) => x.type)).toEqual(['String', 'Boolean']);
    expect(f('placedAt').index).toEqual({ indexed: true, ttlSeconds: 2592000 });
    expect(product.fields.find((x) => x.name === 'price')?.validation.min).toBe(0);
  });

  it('ignores Schema-like text inside strings, comments and regexes', () => {
    const code = `
      // const FakeSchema = new Schema({ nope: String })
      const s = "new Schema({ alsoNope: String })";
      const re = /new Schema\\(\\{/;
      const realSchema = new Schema({ ok: String });
    `;
    const result = parseMongooseCode(code);
    expect(result.collections!.map((c) => c.name)).toEqual(['Real']);
  });

  it('reports precise, line-level errors', () => {
    expect(parseMongooseCode('const a = new Schema({\n  name: String,\n')).toMatchObject({
      success: false, errorLine: 1, error: expect.stringContaining("Unclosed '{'"),
    });
    expect(parseMongooseCode("const a = new Schema({\n  name: 'abc,\n})")).toMatchObject({
      success: false, errorLine: 2, error: expect.stringContaining('Unterminated string'),
    });
    expect(parseMongooseCode('const a = new Schema({\n  name: String\n)})')).toMatchObject({
      success: false, errorLine: 3, error: expect.stringContaining("expected '}'"),
    });
    expect(parseMongooseCode('const x = 1;')).toMatchObject({ success: false, error: expect.stringContaining('No Mongoose schema found') });
    expect(parseMongooseCode('const aSchema = new Schema({ a: String });\nconst AsSchema = new Schema({ b: String });')).toMatchObject({
      success: false, errorLine: 2, error: expect.stringContaining('Duplicate collection'),
    });
  });

  it('warns (without failing) about refs to unknown collections', () => {
    const result = parseMongooseCode("const postSchema = new Schema({ tag: { type: Schema.Types.ObjectId, ref: 'Tag' } });");
    expect(result.success).toBe(true);
    expect(result.collections![0].fields[1].isForeignKey).toBeUndefined();
    expect(result.warnings![0]).toMatchObject({ line: 1, message: expect.stringContaining("ref: 'Tag'") });
  });
});
