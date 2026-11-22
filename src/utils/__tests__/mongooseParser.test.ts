import { describe, it, expect } from 'vitest';
import { parseMongooseCode } from '../mongooseParser';
import type { CollectionNode } from '../../types';

describe('Bi-Directional Mongoose Code Parser', () => {
  it('parses valid Mongoose schemas into CollectionNodes', () => {
    const code = `
      import mongoose, { Schema } from 'mongoose';

      export const userSchema = new Schema({
        email: {
          type: String,
          required: true,
          unique: true,
        },
        age: {
          type: Number,
        },
        role: {
          type: String,
          default: 'member',
        },
      }, {
        timestamps: true,
      });
    `;

    const result = parseMongooseCode(code);
    expect(result.success).toBe(true);
    expect(result.collections).toHaveLength(1);

    const userCol = result.collections![0];
    expect(userCol.name).toBe('User'); // variable name minus the "Schema" suffix
    expect(userCol.timestamps).toBe(true);

    const emailField = userCol.fields.find((f) => f.name === 'email');
    expect(emailField).toBeDefined();
    expect(emailField?.type).toBe('String');
    expect(emailField?.validation.required).toBe(true);
    expect(emailField?.validation.unique).toBe(true);

    const ageField = userCol.fields.find((f) => f.name === 'age');
    expect(ageField?.type).toBe('Number');
  });

  it('parses foreign key references and establishes relationship links', () => {
    const code = `
      export const postSchema = new Schema({
        title: {
          type: String,
          required: true,
        },
        authorId: {
          type: Schema.Types.ObjectId,
          ref: 'User',
          required: true,
          index: true,
        },
      });
    `;

    const existingUsers: CollectionNode[] = [
      {
        id: 'col_users_123',
        name: 'Users',
        icon: 'Users',
        colorTag: '#3B82F6',
        position: { x: 50, y: 100 },
        fields: [{ id: 'f_u_pk', name: '_id', type: 'ObjectId', isPrimaryKey: true, validation: { required: true } }],
      },
    ];

    const result = parseMongooseCode(code, existingUsers);
    expect(result.success).toBe(true);
    const postCol = result.collections![0];

    const authorField = postCol.fields.find((f) => f.name === 'authorId');
    expect(authorField).toBeDefined();
    expect(authorField?.isForeignKey).toBe(true);
    expect(authorField?.foreignKeyRef?.targetCollectionId).toBe('col_users_123');
    expect(authorField?.foreignKeyRef?.targetFieldId).toBe('f_u_pk');
    expect(authorField?.index?.indexed).toBe(true);
  });

  it('parses arrays of referenced ObjectIds', () => {
    const code = `
      export const projectSchema = new Schema({
        name: { type: String, required: true },
        tagIds: [{ type: Schema.Types.ObjectId, ref: 'Tag' }],
      });
    `;

    const result = parseMongooseCode(code);
    expect(result.success).toBe(true);
    const projCol = result.collections![0];
    const tagsField = projCol.fields.find((f) => f.name === 'tagIds');

    expect(tagsField).toBeDefined();
    expect(tagsField?.type).toBe('Array');
    expect(tagsField?.array?.itemType).toBe('ObjectId');
  });

  it('preserves existing collection positions, colors, and IDs on edit', () => {
    const existing: CollectionNode[] = [
      {
        id: 'col_custom_id',
        name: 'Users',
        icon: 'Shield',
        colorTag: '#10B981',
        position: { x: 340, y: 520 },
        fields: [{ id: 'f_existing_pk', name: '_id', type: 'ObjectId', isPrimaryKey: true, validation: { required: true } }],
      },
    ];

    const code = `
      export const userSchema = new Schema({
        name: { type: String, required: true },
      });
    `;

    const result = parseMongooseCode(code, existing);
    expect(result.success).toBe(true);
    const parsedCol = result.collections![0];

    expect(parsedCol.id).toBe('col_custom_id');
    expect(parsedCol.icon).toBe('Shield');
    expect(parsedCol.colorTag).toBe('#10B981');
    expect(parsedCol.position).toEqual({ x: 340, y: 520 });
  });

  it('handles empty code and whitespace without throwing', () => {
    const result1 = parseMongooseCode('');
    expect(result1.success).toBe(false);
    expect(result1.error).toBe('Empty code input');

    const result2 = parseMongooseCode('     \n\n\t  ');
    expect(result2.success).toBe(false);
    expect(result2.error).toBe('Empty code input');
  });

  it('does not throw on partial edits, incomplete brackets, or syntax typos', () => {
    const brokenCode = `
      export const userSchema = new Schema({
        email: { type: String,
      // unclosed block
    `;

    expect(() => {
      const result = parseMongooseCode(brokenCode);
      // Returns clean failure or partial without crashing
      expect(typeof result.success).toBe('boolean');
    }).not.toThrow();
  });
});
