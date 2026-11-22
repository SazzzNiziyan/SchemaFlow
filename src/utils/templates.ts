import { CollectionNode, TemplateId } from '../types';

/** Multi-Tenant SaaS Blueprint (with 2 subtle anti-patterns for auditor demo). */
const SAAS_TEMPLATE: CollectionNode[] = [
  {
    id: 'col_saas_orgs',
    name: 'Organizations',
    icon: 'Building2',
    colorTag: '#6366F1',
    position: { x: 50, y: 100 },
    fields: [
      { id: 'f_org_1', name: '_id', type: 'ObjectId', isPrimaryKey: true, validation: { required: true } },
      { id: 'f_org_2', name: 'name', type: 'String', validation: { required: true } },
      { id: 'f_org_3', name: 'slug', type: 'String', validation: { required: true, unique: true } },
      { id: 'f_org_4', name: 'plan', type: 'Enum', validation: { required: true, defaultVal: "'pro'", enumOptions: ['free', 'pro', 'enterprise'] } },
      { id: 'f_org_5', name: 'createdAt', type: 'Date', validation: { defaultVal: 'Date.now' } },
      { id: 'f_org_6', name: 'updatedAt', type: 'Date', validation: { defaultVal: 'Date.now' } },
    ],
  },
  {
    id: 'col_saas_users',
    name: 'Users',
    icon: 'Users',
    colorTag: '#3B82F6',
    position: { x: 450, y: 100 },
    fields: [
      { id: 'f_usr_1', name: '_id', type: 'ObjectId', isPrimaryKey: true, validation: { required: true } },
      {
        id: 'f_usr_2',
        name: 'orgId',
        type: 'ObjectId',
        isForeignKey: true,
        foreignKeyRef: { targetCollectionId: 'col_saas_orgs', targetFieldId: 'f_org_1', relationType: 'one-to-many' },
        index: { indexed: true },
        validation: { required: true },
      },
      { id: 'f_usr_3', name: 'email', type: 'String', validation: { required: true, unique: true, match: '/^\\S+@\\S+\\.\\S+$/' } },
      { id: 'f_usr_4', name: 'name', type: 'String', validation: { required: true } },
      { id: 'f_usr_5', name: 'passwordHash', type: 'String', validation: { required: true, select: false } },
      { id: 'f_usr_6', name: 'role', type: 'Enum', validation: { defaultVal: "'member'", enumOptions: ['owner', 'admin', 'member'] } },
      { id: 'f_usr_7', name: 'createdAt', type: 'Date', validation: { defaultVal: 'Date.now' } },
    ],
  },
  {
    id: 'col_saas_subs',
    name: 'Subscriptions',
    icon: 'CreditCard',
    colorTag: '#10B981',
    position: { x: 850, y: 100 },
    fields: [
      { id: 'f_sub_1', name: '_id', type: 'ObjectId', isPrimaryKey: true, validation: { required: true } },
      {
        id: 'f_sub_2',
        name: 'orgId',
        type: 'ObjectId',
        isForeignKey: true,
        foreignKeyRef: { targetCollectionId: 'col_saas_orgs', targetFieldId: 'f_org_1', relationType: 'one-to-many' },
        index: { indexed: true },
        validation: { required: true },
      },
      { id: 'f_sub_3', name: 'stripeCustomerId', type: 'String', index: { indexed: true }, validation: { required: true } },
      { id: 'f_sub_4', name: 'status', type: 'Enum', validation: { required: true, defaultVal: "'active'", enumOptions: ['active', 'trailing', 'past_due', 'canceled'] } },
      { id: 'f_sub_5', name: 'currentPeriodEnd', type: 'Date', validation: { required: true } },
      { id: 'f_sub_6', name: 'createdAt', type: 'Date', validation: { defaultVal: 'Date.now' } },
    ],
  },
  {
    id: 'col_saas_projects',
    name: 'Projects',
    icon: 'FolderKanban',
    colorTag: '#EC4899',
    position: { x: 250, y: 480 },
    fields: [
      { id: 'f_prj_1', name: '_id', type: 'ObjectId', isPrimaryKey: true, validation: { required: true } },
      {
        id: 'f_prj_2',
        name: 'orgId',
        type: 'ObjectId',
        isForeignKey: true,
        foreignKeyRef: { targetCollectionId: 'col_saas_orgs', targetFieldId: 'f_org_1', relationType: 'one-to-many' },
        index: { indexed: true },
        validation: { required: true },
      },
      { id: 'f_prj_3', name: 'name', type: 'String', validation: { required: true } },
      { id: 'f_prj_4', name: 'description', type: 'String', validation: { required: false } },
      // Intentional Anti-pattern 1: Unbounded array of comments inside parent document
      { id: 'f_prj_5', name: 'comments', type: 'Array', array: { itemType: 'String' }, validation: { required: false } },
      { id: 'f_prj_6', name: 'createdAt', type: 'Date', validation: { defaultVal: 'Date.now' } },
    ],
  },
  {
    id: 'col_saas_audit',
    name: 'AuditLogs',
    icon: 'ShieldAlert',
    colorTag: '#F59E0B',
    position: { x: 650, y: 480 },
    fields: [
      { id: 'f_aud_1', name: '_id', type: 'ObjectId', isPrimaryKey: true, validation: { required: true } },
      // Intentional Anti-pattern 2: Foreign key without index (causes full collection scans)
      {
        id: 'f_aud_2',
        name: 'orgId',
        type: 'ObjectId',
        isForeignKey: true,
        foreignKeyRef: { targetCollectionId: 'col_saas_orgs', targetFieldId: 'f_org_1', relationType: 'one-to-many' },
        validation: { required: true },
      },
      {
        id: 'f_aud_3',
        name: 'actorId',
        type: 'ObjectId',
        isForeignKey: true,
        foreignKeyRef: { targetCollectionId: 'col_saas_users', targetFieldId: 'f_usr_1', relationType: 'one-to-many' },
        index: { indexed: true },
        validation: { required: true },
      },
      { id: 'f_aud_4', name: 'action', type: 'String', validation: { required: true } },
      { id: 'f_aud_5', name: 'details', type: 'JSON', validation: { required: false } },
      // Intentional Anti-pattern 3: High-frequency log collection without TTL index on Date field
      { id: 'f_aud_6', name: 'timestamp', type: 'Date', validation: { defaultVal: 'Date.now' } },
    ],
  },
];

/** E-Commerce & Inventory Blueprint. */
const ECOMMERCE_TEMPLATE: CollectionNode[] = [
  {
    id: 'col_eco_users',
    name: 'Users',
    icon: 'Users',
    colorTag: '#3B82F6',
    position: { x: 50, y: 100 },
    fields: [
      { id: 'f_eu_1', name: '_id', type: 'ObjectId', isPrimaryKey: true, validation: { required: true } },
      { id: 'f_eu_2', name: 'email', type: 'String', validation: { required: true, unique: true, match: '/^\\S+@\\S+\\.\\S+$/' } },
      { id: 'f_eu_3', name: 'name', type: 'String', validation: { required: true } },
      { id: 'f_eu_4', name: 'createdAt', type: 'Date', validation: { defaultVal: 'Date.now' } },
    ],
  },
  {
    id: 'col_eco_products',
    name: 'Products',
    icon: 'Package',
    colorTag: '#10B981',
    position: { x: 450, y: 100 },
    fields: [
      { id: 'f_ep_1', name: '_id', type: 'ObjectId', isPrimaryKey: true, validation: { required: true } },
      { id: 'f_ep_2', name: 'title', type: 'String', validation: { required: true } },
      { id: 'f_ep_3', name: 'sku', type: 'String', validation: { required: true, unique: true } },
      { id: 'f_ep_4', name: 'price', type: 'Number', validation: { required: true, min: 0 } },
      { id: 'f_ep_5', name: 'inventoryCount', type: 'Number', validation: { required: true, min: 0 } },
      { id: 'f_ep_6', name: 'createdAt', type: 'Date', validation: { defaultVal: 'Date.now' } },
    ],
  },
  {
    id: 'col_eco_orders',
    name: 'Orders',
    icon: 'ShoppingBag',
    colorTag: '#8B5CF6',
    position: { x: 850, y: 100 },
    fields: [
      { id: 'f_eo_1', name: '_id', type: 'ObjectId', isPrimaryKey: true, validation: { required: true } },
      {
        id: 'f_eo_2',
        name: 'userId',
        type: 'ObjectId',
        isForeignKey: true,
        foreignKeyRef: { targetCollectionId: 'col_eco_users', targetFieldId: 'f_eu_1', relationType: 'one-to-many' },
        index: { indexed: true },
        validation: { required: true },
      },
      { id: 'f_eo_3', name: 'totalAmount', type: 'Number', validation: { required: true, min: 0 } },
      { id: 'f_eo_4', name: 'status', type: 'Enum', validation: { required: true, defaultVal: "'pending'", enumOptions: ['pending', 'paid', 'shipped', 'delivered', 'canceled'] } },
      { id: 'f_eo_5', name: 'createdAt', type: 'Date', validation: { defaultVal: 'Date.now' } },
    ],
  },
  {
    id: 'col_eco_reviews',
    name: 'Reviews',
    icon: 'Star',
    colorTag: '#F59E0B',
    position: { x: 250, y: 480 },
    fields: [
      { id: 'f_er_1', name: '_id', type: 'ObjectId', isPrimaryKey: true, validation: { required: true } },
      {
        id: 'f_er_2',
        name: 'productId',
        type: 'ObjectId',
        isForeignKey: true,
        foreignKeyRef: { targetCollectionId: 'col_eco_products', targetFieldId: 'f_ep_1', relationType: 'one-to-many' },
        index: { indexed: true },
        validation: { required: true },
      },
      {
        id: 'f_er_3',
        name: 'userId',
        type: 'ObjectId',
        isForeignKey: true,
        foreignKeyRef: { targetCollectionId: 'col_eco_users', targetFieldId: 'f_eu_1', relationType: 'one-to-many' },
        index: { indexed: true },
        validation: { required: true },
      },
      { id: 'f_er_4', name: 'rating', type: 'Number', validation: { required: true, min: 1, max: 5 } },
      { id: 'f_er_5', name: 'comment', type: 'String', validation: { required: false } },
      { id: 'f_er_6', name: 'createdAt', type: 'Date', validation: { defaultVal: 'Date.now' } },
    ],
  },
  {
    id: 'col_eco_carts',
    name: 'Carts',
    icon: 'ShoppingCart',
    colorTag: '#EC4899',
    position: { x: 650, y: 480 },
    fields: [
      { id: 'f_ec_1', name: '_id', type: 'ObjectId', isPrimaryKey: true, validation: { required: true } },
      {
        id: 'f_ec_2',
        name: 'userId',
        type: 'ObjectId',
        isForeignKey: true,
        foreignKeyRef: { targetCollectionId: 'col_eco_users', targetFieldId: 'f_eu_1', relationType: 'one-to-one' },
        index: { indexed: true },
        validation: { required: true, unique: true },
      },
      { id: 'f_ec_3', name: 'items', type: 'JSON', validation: { required: false } },
      { id: 'f_ec_4', name: 'updatedAt', type: 'Date', validation: { defaultVal: 'Date.now' } },
      { id: 'f_ec_5', name: 'createdAt', type: 'Date', validation: { defaultVal: 'Date.now' } },
    ],
  },
];

/** Real-Time Chat & Collaboration Blueprint. */
const CHAT_TEMPLATE: CollectionNode[] = [
  {
    id: 'col_chat_workspaces',
    name: 'Workspaces',
    icon: 'Network',
    colorTag: '#6366F1',
    position: { x: 50, y: 100 },
    fields: [
      { id: 'f_cw_1', name: '_id', type: 'ObjectId', isPrimaryKey: true, validation: { required: true } },
      { id: 'f_cw_2', name: 'name', type: 'String', validation: { required: true } },
      { id: 'f_cw_3', name: 'slug', type: 'String', validation: { required: true, unique: true } },
      { id: 'f_cw_4', name: 'createdAt', type: 'Date', validation: { defaultVal: 'Date.now' } },
    ],
  },
  {
    id: 'col_chat_users',
    name: 'Users',
    icon: 'Users',
    colorTag: '#3B82F6',
    position: { x: 450, y: 100 },
    fields: [
      { id: 'f_cu_1', name: '_id', type: 'ObjectId', isPrimaryKey: true, validation: { required: true } },
      { id: 'f_cu_2', name: 'email', type: 'String', validation: { required: true, unique: true } },
      { id: 'f_cu_3', name: 'username', type: 'String', validation: { required: true, unique: true } },
      { id: 'f_cu_4', name: 'status', type: 'Enum', validation: { defaultVal: "'offline'", enumOptions: ['online', 'away', 'offline'] } },
      { id: 'f_cu_5', name: 'createdAt', type: 'Date', validation: { defaultVal: 'Date.now' } },
    ],
  },
  {
    id: 'col_chat_channels',
    name: 'Channels',
    icon: 'Hash',
    colorTag: '#10B981',
    position: { x: 850, y: 100 },
    fields: [
      { id: 'f_ch_1', name: '_id', type: 'ObjectId', isPrimaryKey: true, validation: { required: true } },
      {
        id: 'f_ch_2',
        name: 'workspaceId',
        type: 'ObjectId',
        isForeignKey: true,
        foreignKeyRef: { targetCollectionId: 'col_chat_workspaces', targetFieldId: 'f_cw_1', relationType: 'one-to-many' },
        index: { indexed: true },
        validation: { required: true },
      },
      { id: 'f_ch_3', name: 'name', type: 'String', validation: { required: true } },
      { id: 'f_ch_4', name: 'isPrivate', type: 'Boolean', validation: { defaultVal: 'false' } },
      { id: 'f_ch_5', name: 'createdAt', type: 'Date', validation: { defaultVal: 'Date.now' } },
    ],
  },
  {
    id: 'col_chat_messages',
    name: 'Messages',
    icon: 'MessageSquare',
    colorTag: '#EC4899',
    position: { x: 450, y: 480 },
    fields: [
      { id: 'f_cm_1', name: '_id', type: 'ObjectId', isPrimaryKey: true, validation: { required: true } },
      {
        id: 'f_cm_2',
        name: 'channelId',
        type: 'ObjectId',
        isForeignKey: true,
        foreignKeyRef: { targetCollectionId: 'col_chat_channels', targetFieldId: 'f_ch_1', relationType: 'one-to-many' },
        index: { indexed: true },
        validation: { required: true },
      },
      {
        id: 'f_cm_3',
        name: 'senderId',
        type: 'ObjectId',
        isForeignKey: true,
        foreignKeyRef: { targetCollectionId: 'col_chat_users', targetFieldId: 'f_cu_1', relationType: 'one-to-many' },
        index: { indexed: true },
        validation: { required: true },
      },
      { id: 'f_cm_4', name: 'content', type: 'String', validation: { required: true } },
      { id: 'f_cm_5', name: 'createdAt', type: 'Date', validation: { defaultVal: 'Date.now' } },
    ],
  },
];

/** EdTech / LMS Platform Blueprint. */
const LMS_TEMPLATE: CollectionNode[] = [
  {
    id: 'col_lms_students',
    name: 'Students',
    icon: 'GraduationCap',
    colorTag: '#3B82F6',
    position: { x: 50, y: 100 },
    fields: [
      { id: 'f_ls_1', name: '_id', type: 'ObjectId', isPrimaryKey: true, validation: { required: true } },
      { id: 'f_ls_2', name: 'email', type: 'String', validation: { required: true, unique: true } },
      { id: 'f_ls_3', name: 'fullName', type: 'String', validation: { required: true } },
      { id: 'f_ls_4', name: 'createdAt', type: 'Date', validation: { defaultVal: 'Date.now' } },
    ],
  },
  {
    id: 'col_lms_courses',
    name: 'Courses',
    icon: 'BookOpen',
    colorTag: '#10B981',
    position: { x: 450, y: 100 },
    fields: [
      { id: 'f_lc_1', name: '_id', type: 'ObjectId', isPrimaryKey: true, validation: { required: true } },
      { id: 'f_lc_2', name: 'title', type: 'String', validation: { required: true } },
      { id: 'f_lc_3', name: 'slug', type: 'String', validation: { required: true, unique: true } },
      { id: 'f_lc_4', name: 'published', type: 'Boolean', validation: { defaultVal: 'false' } },
      { id: 'f_lc_5', name: 'createdAt', type: 'Date', validation: { defaultVal: 'Date.now' } },
    ],
  },
  {
    id: 'col_lms_modules',
    name: 'Modules',
    icon: 'Layers',
    colorTag: '#F59E0B',
    position: { x: 850, y: 100 },
    fields: [
      { id: 'f_lm_1', name: '_id', type: 'ObjectId', isPrimaryKey: true, validation: { required: true } },
      {
        id: 'f_lm_2',
        name: 'courseId',
        type: 'ObjectId',
        isForeignKey: true,
        foreignKeyRef: { targetCollectionId: 'col_lms_courses', targetFieldId: 'f_lc_1', relationType: 'one-to-many' },
        index: { indexed: true },
        validation: { required: true },
      },
      { id: 'f_lm_3', name: 'title', type: 'String', validation: { required: true } },
      { id: 'f_lm_4', name: 'orderIndex', type: 'Number', validation: { defaultVal: '0' } },
      { id: 'f_lm_5', name: 'createdAt', type: 'Date', validation: { defaultVal: 'Date.now' } },
    ],
  },
  {
    id: 'col_lms_enrollments',
    name: 'Enrollments',
    icon: 'UserCheck',
    colorTag: '#8B5CF6',
    position: { x: 250, y: 480 },
    fields: [
      { id: 'f_le_1', name: '_id', type: 'ObjectId', isPrimaryKey: true, validation: { required: true } },
      {
        id: 'f_le_2',
        name: 'studentId',
        type: 'ObjectId',
        isForeignKey: true,
        foreignKeyRef: { targetCollectionId: 'col_lms_students', targetFieldId: 'f_ls_1', relationType: 'one-to-many' },
        index: { indexed: true },
        validation: { required: true },
      },
      {
        id: 'f_le_3',
        name: 'courseId',
        type: 'ObjectId',
        isForeignKey: true,
        foreignKeyRef: { targetCollectionId: 'col_lms_courses', targetFieldId: 'f_lc_1', relationType: 'one-to-many' },
        index: { indexed: true },
        validation: { required: true },
      },
      { id: 'f_le_4', name: 'status', type: 'Enum', validation: { defaultVal: "'active'", enumOptions: ['active', 'completed', 'dropped'] } },
      { id: 'f_le_5', name: 'enrolledAt', type: 'Date', validation: { defaultVal: 'Date.now' } },
    ],
  },
  {
    id: 'col_lms_submissions',
    name: 'Submissions',
    icon: 'FileCheck',
    colorTag: '#EC4899',
    position: { x: 650, y: 480 },
    fields: [
      { id: 'f_lsb_1', name: '_id', type: 'ObjectId', isPrimaryKey: true, validation: { required: true } },
      {
        id: 'f_lsb_2',
        name: 'studentId',
        type: 'ObjectId',
        isForeignKey: true,
        foreignKeyRef: { targetCollectionId: 'col_lms_students', targetFieldId: 'f_ls_1', relationType: 'one-to-many' },
        index: { indexed: true },
        validation: { required: true },
      },
      {
        id: 'f_lsb_3',
        name: 'moduleId',
        type: 'ObjectId',
        isForeignKey: true,
        foreignKeyRef: { targetCollectionId: 'col_lms_modules', targetFieldId: 'f_lm_1', relationType: 'one-to-many' },
        index: { indexed: true },
        validation: { required: true },
      },
      { id: 'f_lsb_4', name: 'score', type: 'Number', validation: { min: 0, max: 100 } },
      { id: 'f_lsb_5', name: 'submittedAt', type: 'Date', validation: { defaultVal: 'Date.now' } },
    ],
  },
];

/** Default starter schema: Users → Posts → Comments blog. */
const BLOG_TEMPLATE: CollectionNode[] = [
  {
    id: 'col_users',
    name: 'Users',
    icon: 'Users',
    colorTag: '#4A6585',
    position: { x: 50, y: 100 },
    fields: [
      { id: 'f_u_1', name: '_id', type: 'ObjectId', isPrimaryKey: true, validation: { required: true } },
      { id: 'f_u_2', name: 'email', type: 'String', validation: { required: true, unique: true, match: '/^\\S+@\\S+\\.\\S+$/' } },
      { id: 'f_u_3', name: 'username', type: 'String', validation: { required: true } },
      { id: 'f_u_4', name: 'createdAt', type: 'Date', validation: { defaultVal: 'Date.now' } },
    ],
  },
  {
    id: 'col_posts',
    name: 'Posts',
    icon: 'FileText',
    colorTag: '#3F6B4E',
    position: { x: 500, y: 300 },
    fields: [
      { id: 'f_p_1', name: '_id', type: 'ObjectId', isPrimaryKey: true, validation: { required: true } },
      {
        id: 'f_p_2',
        name: 'authorId',
        type: 'ObjectId',
        isForeignKey: true,
        foreignKeyRef: { targetCollectionId: 'col_users', targetFieldId: 'f_u_1', relationType: 'one-to-many' },
        index: { indexed: true },
        validation: { required: true },
      },
      { id: 'f_p_3', name: 'title', type: 'String', validation: { required: true } },
      { id: 'f_p_4', name: 'content', type: 'String', validation: { required: false } },
    ],
  },
  {
    id: 'col_comments',
    name: 'Comments',
    icon: 'MessageCircle',
    colorTag: '#B05A3C',
    position: { x: 900, y: 100 },
    fields: [
      { id: 'f_c_1', name: '_id', type: 'ObjectId', isPrimaryKey: true, validation: { required: true } },
      {
        id: 'f_c_2',
        name: 'postId',
        type: 'ObjectId',
        isForeignKey: true,
        foreignKeyRef: { targetCollectionId: 'col_posts', targetFieldId: 'f_p_1', relationType: 'one-to-many' },
        index: { indexed: true },
        validation: { required: true },
      },
      { id: 'f_c_3', name: 'text', type: 'String', validation: { required: true } },
    ],
  },
];

const TEMPLATES: Record<TemplateId, CollectionNode[]> = {
  saas: SAAS_TEMPLATE,
  ecommerce: ECOMMERCE_TEMPLATE,
  chat: CHAT_TEMPLATE,
  lms: LMS_TEMPLATE,
  blog: BLOG_TEMPLATE,
  empty: [],
};

export interface TemplateMeta {
  id: TemplateId;
  name: string;
  description: string;
  collectionsCount: number;
  tag: string;
}

export const BLUEPRINTS: TemplateMeta[] = [
  {
    id: 'saas',
    name: 'Multi-Tenant SaaS',
    description: 'Organizations, Users, Subscriptions, Projects, and AuditLogs (with auditor demo issues).',
    collectionsCount: 5,
    tag: 'Recommended',
  },
  {
    id: 'ecommerce',
    name: 'E-Commerce & Inventory',
    description: 'Users, Products, Orders, Reviews, and Shopping Carts with strict indexes.',
    collectionsCount: 5,
    tag: 'Production',
  },
  {
    id: 'chat',
    name: 'Real-Time Chat & Collab',
    description: 'Workspaces, Channels, Messages, and User Presences for team communication.',
    collectionsCount: 4,
    tag: 'Messaging',
  },
  {
    id: 'lms',
    name: 'EdTech / LMS Platform',
    description: 'Students, Courses, Modules, Enrollments, and Assignment Submissions.',
    collectionsCount: 5,
    tag: 'Education',
  },
  {
    id: 'blog',
    name: 'Classic Blog',
    description: 'Lightweight Users, Posts, and Comments starter model.',
    collectionsCount: 3,
    tag: 'Starter',
  },
];

/** Returns a deep copy of a template so callers can never mutate the source. */
export function getTemplate(id: TemplateId): CollectionNode[] {
  const tpl = TEMPLATES[id] || TEMPLATES.saas;
  return structuredClone(tpl);
}
