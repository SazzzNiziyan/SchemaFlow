import { beforeEach, describe, expect, it } from 'vitest';
import { undo, useSchemaStore } from '../../store/useSchemaStore';
import { generateMongooseCode } from '../codeGenerators';
import { parseMongooseCode } from '../mongooseParser';

const state = () => useSchemaStore.getState();
const couponOrderRef = (cols: ReturnType<typeof state>['collections']) =>
  cols.find((c) => c.name === 'Coupon')?.fields.find((f) => f.name === 'orderId')?.foreignKeyRef?.targetCollectionId;

/** Simulates CodeDrawer: generate → user edit → parse → syncFromCode. */
function editAndSync(scopeIds: string[], edit: (code: string) => string) {
  const all = state().collections;
  const scoped = all.filter((c) => scopeIds.includes(c.id));
  const code = edit(generateMongooseCode(scoped, { allCollections: all }));
  const result = parseMongooseCode(code, all);
  expect(result.error).toBeUndefined();
  return state().syncFromCode(result.collections!, scopeIds);
}

describe('Code → canvas sync (store)', () => {
  beforeEach(() => {
    state().loadTemplate('ecommerce');
    useSchemaStore.temporal.getState().clear();
  });

  it('single-collection edit upserts that collection and leaves the rest of the canvas alone', () => {
    const before = state().collections;
    const orders = before.find((c) => c.name === 'Orders')!;

    const summary = editAndSync([orders.id], (code) =>
      code.replace(
        /(export const orderSchema = new Schema<IOrder>\(\{\n)/,
        "$1  phone: { type: String, unique: true },\n  productId: { type: Schema.Types.ObjectId, ref: 'Product' },\n",
      ),
    );

    expect(summary).toEqual({ added: 0, updated: 1, removed: 0, changed: true });
    const after = state().collections;
    expect(after).toHaveLength(before.length);
    // Untouched collections keep object identity (no re-render, same layout).
    before.filter((c) => c.id !== orders.id).forEach((c) => expect(after.find((x) => x.id === c.id)).toBe(c));

    const nextOrders = after.find((c) => c.id === orders.id)!;
    expect(nextOrders.position).toEqual(orders.position);
    expect(nextOrders.colorTag).toBe(orders.colorTag);
    expect(nextOrders.fields.find((f) => f.name === 'phone')?.validation.unique).toBe(true);
    const products = after.find((c) => c.name === 'Products')!;
    expect(nextOrders.fields.find((f) => f.name === 'productId')?.foreignKeyRef).toMatchObject({
      targetCollectionId: products.id,
      relationType: 'one-to-many',
    });
    // Existing field ids survive, so existing edges are untouched.
    orders.fields.forEach((f) => expect(nextOrders.fields.find((x) => x.name === f.name)?.id).toBe(f.id));
  });

  it('full-schema edit diffs everything: keeps positions, places new collections, removes deleted ones', () => {
    const before = state().collections;
    const all = before.map((c) => c.id);

    const summary = editAndSync(all, (code) => {
      // Delete the Reviews schema + model, add a new Coupon collection.
      const start = code.indexOf('// ============================================================================\n// Review Interface');
      const end = code.indexOf('// ============================================================================', start + 200); // skip past this block's own 3-line header
      return (
        code.slice(0, start) +
        code.slice(end) +
        "\n\nconst couponSchema = new Schema({ code: { type: String, required: true, unique: true }, orderId: { type: Schema.Types.ObjectId, ref: 'Order' } });\nmongoose.model('Coupon', couponSchema);"
      );
    });

    expect(summary).toMatchObject({ added: 1, removed: 1, changed: true });
    const after = state().collections;
    // Canvas order is kept; the new collection is appended.
    expect(after.map((c) => c.name)).toEqual([...before.map((c) => c.name).filter((n) => n !== 'Reviews'), 'Coupon']);
    expect(couponOrderRef(after)).toBe(after.find((c) => c.name === 'Orders')!.id);
    after.slice(0, 4).forEach((c) => expect(c.position).toEqual(before.find((b) => b.id === c.id)!.position));
    const coupon = after.find((c) => c.name === 'Coupon')!;
    // New node does not overlap the existing layout.
    expect(after.slice(0, 4).some((c) => c.position.x === coupon.position.x && c.position.y === coupon.position.y)).toBe(false);
  });

  it('records the sync as exactly one undo step, and no step when nothing changed', () => {
    const before = state().collections;
    const orders = before.find((c) => c.name === 'Orders')!;

    expect(editAndSync([orders.id], (c) => c).changed).toBe(false);
    expect(useSchemaStore.temporal.getState().pastStates).toHaveLength(0);

    editAndSync([orders.id], (code) => code.replace('totalAmount: {', 'phone: String,\n  totalAmount: {'));
    expect(useSchemaStore.temporal.getState().pastStates).toHaveLength(1);

    undo();
    expect(state().collections).toEqual(before);
  });
});
