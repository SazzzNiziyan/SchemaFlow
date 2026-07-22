export type FieldType =
  | 'String'
  | 'Number'
  | 'Boolean'
  | 'Date'
  | 'ObjectId'
  | 'Array'
  | 'Enum'
  | 'JSON'
  | 'Decimal'
  | 'UUID';

export type TargetFramework = 'mongoose' | 'prisma' | 'postgres' | 'drizzle' | 'typescript' | 'jsonSchema';

export interface FieldValidation {
  required?: boolean;
  unique?: boolean;
  match?: string; // Regex
  defaultVal?: string;
  min?: number;
  max?: number;
  enumOptions?: string[];
}

export interface ForeignKeyRef {
  targetCollectionId: string;
  targetFieldId: string;
}

export interface SchemaField {
  id: string;
  name: string;
  type: FieldType;
  isPrimaryKey?: boolean;
  isForeignKey?: boolean;
  foreignKeyRef?: ForeignKeyRef;
  validation: FieldValidation;
}

export interface CollectionNode {
  id: string;
  name: string;
  icon: string; // Lucide icon name or indicator
  colorTag: string; // e.g. '#afc6ff', '#4ae176', '#d0bcff'
  position: { x: number; y: number };
  fields: SchemaField[];
}

export interface RelationshipConnection {
  id: string;
  sourceCollectionId: string;
  sourceFieldId: string;
  targetCollectionId: string;
  targetFieldId: string;
  type: 'one-to-one' | 'one-to-many' | 'many-to-many';
}

export interface ProjectMetadata {
  name: string;
  ormVersion: string;
  framework: TargetFramework;
}
