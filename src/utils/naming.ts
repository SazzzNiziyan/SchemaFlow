/**
 * Naming helpers shared by the Mongoose generator and parser so that the model
 * names we emit (`'User'`) always resolve back to the collections they came
 * from (`Users`).
 */

/** Best-effort English singular: `Categories` → `Category`, `Users` → `User`, `Status` → `Status`. */
export function singularize(word: string): string {
  if (/ies$/i.test(word) && word.length > 3) return word.slice(0, -3) + (/[A-Z]$/.test(word.slice(-3, -2)) ? 'Y' : 'y');
  if (/(ss|us|is|news)$/i.test(word)) return word;
  if (/(x|ch|sh|ss|z)es$/i.test(word)) return word.slice(0, -2);
  if (/s$/i.test(word) && word.length > 1) return word.slice(0, -1);
  return word;
}

const capitalize = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

/** Mongoose model name for a collection: `users` → `User`, `order_items` → `Order_item`. */
export function modelNameFor(collectionName: string): string {
  return capitalize(singularize(collectionName.trim()));
}

/** Schema variable name for a collection: `Users` → `userSchema`. */
export function schemaVarFor(collectionName: string): string {
  const model = modelNameFor(collectionName);
  return `${model.charAt(0).toLowerCase()}${model.slice(1)}Schema`;
}

/**
 * Comparison keys for fuzzy, case-insensitive singular/plural matching.
 * Two names refer to the same collection when their key sets intersect.
 */
export function nameKeys(name: string): Set<string> {
  const lower = name.trim().toLowerCase().replace(/[\s_-]+/g, '');
  const keys = new Set<string>([lower]);
  keys.add(singularize(lower));
  if (lower.endsWith('s')) keys.add(lower.slice(0, -1)); // legacy `.replace(/s$/, '')` model names
  keys.add(`${singularize(lower)}s`);
  return keys;
}

export function namesMatch(a: string, b: string): boolean {
  const ka = nameKeys(a);
  for (const k of nameKeys(b)) if (ka.has(k)) return true;
  return false;
}
