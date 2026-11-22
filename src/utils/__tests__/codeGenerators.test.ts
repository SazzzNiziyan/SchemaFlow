import { describe, it, expect } from 'vitest';
import {
  generateMongooseCode,
  generateZodCode,
  generateTypeScriptCode,
  generateExpressApiCode,
  generateJsonSchemaCode,
  generateMockDocuments,
  generateMockDataCode,
  generateAggregationPipeline,
} from '../codeGenerators';
import type { CollectionNode } from '../../types';

describe('Code Generators Engine', () => {
  const sampleSchema: CollectionNode[] = [
    {
      id: 'col_users',
      name: 'Users',
      icon: 'Users',
      colorTag: '#6366F1',
      position: { x: 50, y: 100 },
      timestamps: true,
      fields: [
        { id: 'f_u_1', name: '_id', type: 'ObjectId', isPrimaryKey: true, validation: { required: true } },
        { id: 'f_u_2', name: 'email', type: 'String', validation: { required: true, unique: true, match: '/^\\S+@\\S+$/' } },
        { id: 'f_u_3', name: 'passwordHash', type: 'String', validation: { required: true, select: false } },
        { id: 'f_u_4', name: 'role', type: 'Enum', validation: { defaultVal: "'user'", enumOptions: ['admin', 'user', 'guest'] } },
        { id: 'f_u_5', name: 'age', type: 'Number', validation: { min: 18, max: 120 } },
        { id: 'f_u_6', name: 'createdAt', type: 'Date', validation: { defaultVal: 'Date.now' } },
      ],
    },
    {
      id: 'col_orders',
      name: 'Orders',
      icon: 'ShoppingBag',
      colorTag: '#10B981',
      position: { x: 450, y: 100 },
      timestamps: true,
      compoundIndexes: [
        { id: 'ci_1', fields: [{ fieldId: 'f_o_2', direction: 1 }, { fieldId: 'f_o_4', direction: -1 }] },
      ],
      fields: [
        { id: 'f_o_1', name: '_id', type: 'ObjectId', isPrimaryKey: true, validation: { required: true } },
        {
          id: 'f_o_2',
          name: 'userId',
          type: 'ObjectId',
          isForeignKey: true,
          foreignKeyRef: { targetCollectionId: 'col_users', targetFieldId: 'f_u_1', relationType: 'one-to-many' },
          index: { indexed: true },
          validation: { required: true },
        },
        { id: 'f_o_3', name: 'totalAmount', type: 'Number', validation: { required: true, min: 0 } },
        { id: 'f_o_4', name: 'createdAt', type: 'Date', validation: { defaultVal: 'Date.now' } },
        {
          id: 'f_o_5',
          name: 'sessionExpiry',
          type: 'Date',
          index: { indexed: true, ttlSeconds: 86400 },
          validation: { required: false },
        },
      ],
    },
  ];

  describe('generateMongooseCode', () => {
    it('generates valid Mongoose schema with interfaces, refs, indexes, and options', () => {
      const code = generateMongooseCode(sampleSchema);

      expect(code).toContain("import mongoose, { Schema, Document, Model } from 'mongoose';");
      expect(code).toContain('export interface IUser extends Document');
      expect(code).toContain('export const userSchema = new Schema<IUser>');

      // Unique constraint and match regex
      expect(code).toContain('unique: true');
      expect(code).toContain('select: false');
      expect(code).toContain("enum: ['admin', 'user', 'guest']");

      // Foreign key ref
      expect(code).toContain("type: Schema.Types.ObjectId");
      expect(code).toContain("ref: 'User'");

      // Secondary index and TTL index
      expect(code).toContain('index: true');
      expect(code).toContain('expireAfterSeconds: 86400');

      // Compound index
      expect(code).toContain('orderSchema.index({ userId: 1, createdAt: -1 });');

      // Timestamps option
      expect(code).toContain('timestamps: true');
    });

    it('handles empty collection list gracefully', () => {
      const code = generateMongooseCode([]);
      expect(code).toContain('// No collections defined');
    });
  });

  describe('generateZodCode', () => {
    it('generates strict Zod schemas for entity creation and updates', () => {
      const code = generateZodCode(sampleSchema);

      expect(code).toContain("import { z } from 'zod';");
      expect(code).toContain('export const CreateUserSchema = z.object({');
      expect(code).toContain('export const UpdateUserSchema = CreateUserSchema.partial();');

      // Email match regex / email validator
      expect(code).toContain('z.string().email()');

      // Enums
      expect(code).toContain("z.enum(['admin', 'user', 'guest'])");

      // Numbers with min and max constraints
      expect(code).toContain('.min(18)');
      expect(code).toContain('.max(120)');

      // ObjectId validation
      expect(code).toContain('zObjectId');
    });
  });

  describe('generateTypeScriptCode', () => {
    it('generates TypeScript interfaces and DTOs with strict optionality', () => {
      const code = generateTypeScriptCode(sampleSchema);

      expect(code).toContain('export interface IUser {');
      expect(code).toContain('export interface CreateUserDto {');
      expect(code).toContain('email: string;');
      expect(code).toContain('age?: number;');
      expect(code).toContain('createdAt?: Date | string;');
    });
  });

  describe('generateExpressApiCode', () => {
    it('generates complete Express CRUD router wired with Zod validation', () => {
      const code = generateExpressApiCode(sampleSchema);

      expect(code).toContain("import { Router, Request, Response, NextFunction } from 'express';");
      expect(code).toContain('export const userRouter = Router();');
      expect(code).toContain("userRouter.get('/', async (req: Request, res: Response)");
      expect(code).toContain("userRouter.post('/', async (req: Request, res: Response)");
      expect(code).toContain('export const orderRouter = Router();');
    });
  });

  describe('generateJsonSchemaCode', () => {
    it('generates native MongoDB $jsonSchema and createIndex statements', () => {
      const code = generateJsonSchemaCode(sampleSchema);

      expect(code).toContain('validator: {');
      expect(code).toContain('$jsonSchema: {');
      expect(code).toContain("bsonType: 'object',");
      expect(code).toContain('properties: {');
      expect(code).toContain('db.orders.createIndex({ userId: 1 });');
    });
  });

  describe('generateMockDocuments', () => {
    it('generates realistic mock JSON documents with linked foreign keys', () => {
      const mockDocs = generateMockDocuments(sampleSchema, 3);

      expect(mockDocs['Users']).toHaveLength(3);
      expect(mockDocs['Orders']).toHaveLength(3);

      const firstUser = mockDocs['Users'][0];
      expect(firstUser).toHaveProperty('_id');
      expect(firstUser).toHaveProperty('email');
      expect(firstUser.email).toContain('@');

      const firstOrder = mockDocs['Orders'][0];
      expect(firstOrder).toHaveProperty('userId');
      // Foreign key matches one of the generated user IDs
      const userIds = mockDocs['Users'].map((u: any) => u._id);
      expect(userIds).toContain(firstOrder.userId);

      const jsonStr = generateMockDataCode(sampleSchema);
      expect(jsonStr).toContain('{');
    });
  });

  describe('generateAggregationPipeline ($lookup Query Sandbox)', () => {
    it('generates an aggregation pipeline with $lookup, $project, and IXSCAN index advice', () => {
      const result = generateAggregationPipeline(sampleSchema, 'col_orders', 'col_users');

      expect(result.pipelineCode).toContain('db.orders.aggregate([');
      expect(result.pipelineCode).toContain('$lookup: {');
      expect(result.pipelineCode).toContain("from: 'users',");
      expect(result.pipelineCode).toContain("localField: 'userId',");
      expect(result.pipelineCode).toContain("foreignField: '_id',");
      expect(result.pipelineCode).toContain('$project: {');

      expect(result.indexRecommendation).toContain('db.orders.createIndex({ userId: 1 });');
      expect(result.indexRecommendation).toContain('Guarantees IXSCAN');
    });

    it('handles schemas with no relations gracefully', () => {
      const soloSchema: CollectionNode[] = [
        {
          id: 'c1',
          name: 'Items',
          icon: 'Package',
          colorTag: '#6366F1',
          position: { x: 50, y: 100 },
          fields: [{ id: 'f1', name: '_id', type: 'ObjectId', isPrimaryKey: true, validation: { required: true } }],
        },
      ];
      const result = generateAggregationPipeline(soloSchema);
      expect(result.pipelineCode).toContain('Connect two collections on the canvas');
    });
  });
});
