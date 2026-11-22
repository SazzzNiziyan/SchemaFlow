/**
 * Mongoose source → SchemaFlow collections.
 *
 * Pipeline:
 *   1. `tokenize` — a small JS/TS lexer that understands strings, template
 *      literals, regex literals and comments, and validates bracket balance
 *      (so we can report exact line numbers while the user is typing).
 *   2. `ValueParser` — turns token ranges into a tiny value tree (objects,
 *      arrays, literals, identifier paths, `new X(...)`, calls, and opaque
 *      `raw` expressions for anything else, e.g. arrow functions).
 *   3. Discovery — finds every `new Schema(...)` (any `x.Schema`, any TS
 *      generics), the variable it is bound to, `model('Name', schema)` calls
 *      (including inline `model('X', new Schema(...))`) and `schema.index()`.
 *   4. Mapping — converts field definitions to {@link SchemaField}s and
 *      re-uses ids / positions / colors / relationship types from
 *      `existingCollections` so a code edit never disturbs the canvas layout.
 *
 * Never throws; problems are returned as `error` (+ `errorLine`) or as
 * non-fatal `warnings`.
 */
import type {
  CollectionNode,
  CompoundIndex,
  FieldType,
  IndexDirection,
  RelationshipType,
  SchemaField,
} from '../types';
import { createId } from './schemaOps';
import { namesMatch, singularize } from './naming';

export interface ParseWarning {
  message: string;
  line?: number;
}

export interface ParseStats {
  collections: number;
  fields: number;
  relationships: number;
}

export interface ParseResult {
  success: boolean;
  collections?: CollectionNode[];
  error?: string;
  errorLine?: number;
  warnings?: ParseWarning[];
  stats?: ParseStats;
}

// ---------------------------------------------------------------------------
// 1. Tokenizer
// ---------------------------------------------------------------------------

type TokType = 'ident' | 'string' | 'number' | 'regex' | 'template' | 'punct';

interface Token {
  type: TokType;
  /** Identifier name, punctuation, or the *decoded* string value. */
  value: string;
  start: number;
  end: number;
  line: number;
}

class ParseError extends Error {
  constructor(message: string, public line?: number) {
    super(message);
  }
}

const REGEX_PRECEDERS = new Set(['(', ',', '=', ':', '[', '!', '&', '|', '?', '{', '}', ';', '+', '-', '*', '%', '<', '>', '~', '^', '=>']);
const REGEX_KEYWORDS = new Set(['return', 'typeof', 'case', 'do', 'else', 'in', 'of', 'new', 'delete', 'void', 'throw', 'instanceof']);
const CLOSER: Record<string, string> = { '(': ')', '[': ']', '{': '}' };

function tokenize(src: string): Token[] {
  const tokens: Token[] = [];
  const stack: { ch: string; line: number }[] = [];
  let i = 0;
  let line = 1;
  const n = src.length;

  const push = (type: TokType, value: string, start: number, startLine: number) =>
    tokens.push({ type, value, start, end: i, line: startLine });

  const regexAllowed = () => {
    const prev = tokens[tokens.length - 1];
    if (!prev) return true;
    if (prev.type === 'punct') return REGEX_PRECEDERS.has(prev.value);
    if (prev.type === 'ident') return REGEX_KEYWORDS.has(prev.value);
    return false;
  };

  while (i < n) {
    const ch = src[i];
    const start = i;
    const startLine = line;

    if (ch === '\n') { line++; i++; continue; }
    if (ch === ' ' || ch === '\t' || ch === '\r' || ch === '\f' || ch === '\v' || ch === '﻿') { i++; continue; }

    // Comments
    if (ch === '/' && src[i + 1] === '/') {
      while (i < n && src[i] !== '\n') i++;
      continue;
    }
    if (ch === '/' && src[i + 1] === '*') {
      const close = src.indexOf('*/', i + 2);
      if (close === -1) throw new ParseError('Unterminated block comment (missing "*/")', startLine);
      for (let k = i; k < close; k++) if (src[k] === '\n') line++;
      i = close + 2;
      continue;
    }

    // Strings
    if (ch === '"' || ch === "'") {
      i++;
      let value = '';
      while (i < n && src[i] !== ch) {
        if (src[i] === '\n') throw new ParseError(`Unterminated string literal (missing closing ${ch})`, startLine);
        if (src[i] === '\\') {
          const nx = src[i + 1];
          value += nx === 'n' ? '\n' : nx === 't' ? '\t' : nx ?? '';
          if (nx === '\n') line++;
          i += 2;
          continue;
        }
        value += src[i++];
      }
      if (i >= n) throw new ParseError(`Unterminated string literal (missing closing ${ch})`, startLine);
      i++;
      push('string', value, start, startLine);
      continue;
    }

    // Template literals (with nested `${ ... }` expressions)
    if (ch === '`') {
      i++;
      let depth = 0;
      while (i < n) {
        const c = src[i];
        if (c === '\n') line++;
        if (c === '\\') { i += 2; continue; }
        if (depth === 0 && c === '`') break;
        if (c === '$' && src[i + 1] === '{') { depth++; i += 2; continue; }
        if (depth > 0 && c === '}') depth--;
        i++;
      }
      if (i >= n) throw new ParseError('Unterminated template literal (missing closing `)', startLine);
      i++;
      push('template', src.slice(start + 1, i - 1), start, startLine);
      continue;
    }

    // Regex literals
    if (ch === '/' && regexAllowed()) {
      i++;
      let inClass = false;
      while (i < n) {
        const c = src[i];
        if (c === '\n') throw new ParseError('Unterminated regular expression literal', startLine);
        if (c === '\\') { i += 2; continue; }
        if (c === '[') inClass = true;
        else if (c === ']') inClass = false;
        else if (c === '/' && !inClass) break;
        i++;
      }
      if (i >= n) throw new ParseError('Unterminated regular expression literal', startLine);
      i++;
      while (i < n && /[a-z]/i.test(src[i])) i++;
      push('regex', src.slice(start, i), start, startLine);
      continue;
    }

    // Numbers
    if (/[0-9]/.test(ch) || (ch === '.' && /[0-9]/.test(src[i + 1] ?? ''))) {
      while (i < n && /[0-9a-fA-FxXoObBn_.eE]/.test(src[i])) {
        if ((src[i] === 'e' || src[i] === 'E') && (src[i + 1] === '-' || src[i + 1] === '+')) i++;
        i++;
      }
      push('number', src.slice(start, i), start, startLine);
      continue;
    }

    // Identifiers / keywords
    if (/[A-Za-z_$À-￿]/.test(ch)) {
      while (i < n && /[\w$À-￿]/.test(src[i])) i++;
      push('ident', src.slice(start, i), start, startLine);
      continue;
    }

    // Punctuation (only the multi-char operators we care about are merged)
    const three = src.slice(i, i + 3);
    const two = src.slice(i, i + 2);
    if (three === '...') { i += 3; push('punct', three, start, startLine); continue; }
    if (two === '=>' || two === '?.' || two === '&&' || two === '||' || two === '??') {
      i += 2;
      push('punct', two, start, startLine);
      continue;
    }

    if (ch === '(' || ch === '[' || ch === '{') stack.push({ ch, line });
    if (ch === ')' || ch === ']' || ch === '}') {
      const open = stack.pop();
      if (!open) throw new ParseError(`Unexpected '${ch}' — there is no matching opening bracket`, line);
      if (CLOSER[open.ch] !== ch) {
        throw new ParseError(
          `Unexpected '${ch}' — expected '${CLOSER[open.ch]}' to close '${open.ch}' from line ${open.line}`,
          line,
        );
      }
    }
    i++;
    push('punct', ch, start, startLine);
  }

  if (stack.length) {
    const open = stack[stack.length - 1];
    throw new ParseError(`Unclosed '${open.ch}' — missing '${CLOSER[open.ch]}'`, open.line);
  }
  return tokens;
}

// ---------------------------------------------------------------------------
// 2. Value parser
// ---------------------------------------------------------------------------

type Value =
  | { kind: 'object'; props: { key: string; value: Value; line: number }[]; line: number; tokStart: number }
  | { kind: 'array'; items: Value[]; line: number }
  | { kind: 'string'; value: string; line: number }
  | { kind: 'number'; value: number; raw: string; line: number }
  | { kind: 'regex'; raw: string; line: number }
  | { kind: 'path'; path: string; line: number }
  | { kind: 'new'; callee: string; args: Value[]; line: number; tokStart: number }
  | { kind: 'call'; callee: string; args: Value[]; line: number }
  | { kind: 'raw'; raw: string; line: number };

const OPEN = new Set(['(', '[', '{']);
const CLOSE = new Set([')', ']', '}']);

class ValueParser {
  constructor(private toks: Token[], private src: string) {}

  /** Index of the matching closer for the opener at `i` (brackets are pre-validated). */
  matching(i: number): number {
    let depth = 0;
    for (let k = i; k < this.toks.length; k++) {
      const t = this.toks[k];
      if (t.type !== 'punct') continue;
      if (OPEN.has(t.value)) depth++;
      else if (CLOSE.has(t.value) && --depth === 0) return k;
    }
    return this.toks.length - 1;
  }

  /** Skips a `<...>` generic list starting at `i`; returns the index after `>` or `i` if not generics. */
  skipGenerics(i: number): number {
    if (this.toks[i]?.value !== '<' || this.toks[i].type !== 'punct') return i;
    let depth = 0;
    for (let k = i; k < this.toks.length; k++) {
      const t = this.toks[k];
      if (t.type !== 'punct') continue;
      if (t.value === '<') depth++;
      else if (t.value === '>' && --depth === 0) return k + 1;
      else if (t.value === ';' || t.value === ')' || t.value === '}') return i;
      else if (OPEN.has(t.value)) k = this.matching(k);
    }
    return i;
  }

  /** Index of the next top-level `,` or closing bracket at/after `i`. */
  private nextTerminator(i: number): number {
    for (let k = i; k < this.toks.length; k++) {
      const t = this.toks[k];
      if (t.type !== 'punct') continue;
      if (OPEN.has(t.value)) k = this.matching(k);
      else if (t.value === ',' || t.value === ';' || CLOSE.has(t.value)) return k;
    }
    return this.toks.length;
  }

  private isTerminator(i: number): boolean {
    const t = this.toks[i];
    return !t || (t.type === 'punct' && (t.value === ',' || t.value === ';' || CLOSE.has(t.value)));
  }

  private rawUntil(from: number, to: number): string {
    const first = this.toks[from];
    const last = this.toks[Math.max(from, to - 1)];
    return first && last ? this.src.slice(first.start, last.end).trim() : '';
  }

  /** Parses comma-separated values from `i` (just after an opener) up to `close`. */
  list(i: number, close: number): Value[] {
    const out: Value[] = [];
    while (i < close) {
      if (this.toks[i].value === ',' && this.toks[i].type === 'punct') { i++; continue; }
      const [v, next] = this.value(i);
      out.push(v);
      i = next;
    }
    return out;
  }

  /** Parses one value at `i`; returns `[value, indexAfterValue]`. */
  value(i: number): [Value, number] {
    const [primary, after] = this.primary(i);
    if (this.isTerminator(after)) return [primary, after];
    // Anything more complex (`a || b`, `() => x`, `x as T`, ...) becomes opaque.
    const end = this.nextTerminator(after);
    return [{ kind: 'raw', raw: this.rawUntil(i, end), line: this.toks[i].line }, end];
  }

  private primary(i: number): [Value, number] {
    const t = this.toks[i];
    const line = t.line;
    if (t.type === 'string' || t.type === 'template') return [{ kind: 'string', value: t.value, line }, i + 1];
    if (t.type === 'number') return [{ kind: 'number', value: Number(t.value.replace(/_/g, '')), raw: t.value, line }, i + 1];
    if (t.type === 'regex') return [{ kind: 'regex', raw: t.value, line }, i + 1];
    if (t.type === 'punct') {
      if (t.value === '{') return this.object(i);
      if (t.value === '[') {
        const close = this.matching(i);
        return [{ kind: 'array', items: this.list(i + 1, close), line }, close + 1];
      }
      if (t.value === '-' && this.toks[i + 1]?.type === 'number') {
        const num = this.toks[i + 1];
        return [{ kind: 'number', value: -Number(num.value), raw: `-${num.value}`, line }, i + 2];
      }
      // e.g. `() => Date.now()` — skip the whole parenthesised group first.
      const end = this.nextTerminator(OPEN.has(t.value) ? this.matching(i) + 1 : i + 1);
      return [{ kind: 'raw', raw: this.rawUntil(i, end), line }, end];
    }
    // identifier
    if (t.value === 'new') {
      const [callee, k] = this.path(i + 1);
      let j = this.skipGenerics(k);
      if (this.toks[j]?.value === '(') {
        const close = this.matching(j);
        return [{ kind: 'new', callee, args: this.list(j + 1, close), line, tokStart: i }, close + 1];
      }
      return [{ kind: 'new', callee, args: [], line, tokStart: i }, j];
    }
    const [path, k] = this.path(i);
    const j = this.skipGenerics(k);
    if (this.toks[j]?.value === '(' && this.toks[j].type === 'punct') {
      const close = this.matching(j);
      return [{ kind: 'call', callee: path, args: this.list(j + 1, close), line }, close + 1];
    }
    return [{ kind: 'path', path, line }, k];
  }

  /** Reads `a.b.c` (also `a?.b`); returns the dotted path and next index. */
  path(i: number): [string, number] {
    const parts: string[] = [];
    let k = i;
    while (this.toks[k]?.type === 'ident') {
      parts.push(this.toks[k].value);
      const dot = this.toks[k + 1];
      if (dot?.type === 'punct' && (dot.value === '.' || dot.value === '?.') && this.toks[k + 2]?.type === 'ident') k += 2;
      else { k++; break; }
    }
    return [parts.join('.'), k];
  }

  private object(i: number): [Value, number] {
    const close = this.matching(i);
    const props: { key: string; value: Value; line: number }[] = [];
    let k = i + 1;
    while (k < close) {
      const t = this.toks[k];
      if (t.type === 'punct' && t.value === ',') { k++; continue; }
      // Spread / computed keys / anything unusual: skip the member.
      if (t.type === 'punct' && (t.value === '...' || t.value === '[')) {
        k = this.nextTerminator(t.value === '[' ? this.matching(k) + 1 : k + 1);
        continue;
      }
      const isKey = t.type === 'ident' || t.type === 'string' || t.type === 'number';
      const colon = this.toks[k + 1];
      if (isKey && colon?.type === 'punct' && colon.value === ':') {
        const [v, next] = this.value(k + 2);
        props.push({ key: t.value, value: v, line: t.line });
        k = next;
        continue;
      }
      if (isKey && t.type === 'ident' && this.isTerminator(k + 1)) {
        // shorthand `{ email }` → value is the identifier of the same name
        props.push({ key: t.value, value: { kind: 'path', path: t.value, line: t.line }, line: t.line });
        k++;
        continue;
      }
      // Methods (`validate() { ... }`) and other members we do not model.
      let m = k;
      while (m < close && !(this.toks[m].type === 'punct' && this.toks[m].value === ',')) {
        if (this.toks[m].type === 'punct' && OPEN.has(this.toks[m].value)) m = this.matching(m);
        m++;
      }
      k = m;
    }
    return [{ kind: 'object', props, line: this.toks[i].line, tokStart: i }, close + 1];
  }
}

// ---------------------------------------------------------------------------
// 3. Discovery
// ---------------------------------------------------------------------------

interface SchemaDecl {
  /** Token index of `new`. */
  tokIndex: number;
  line: number;
  varName?: string;
  modelName?: string;
  definition?: Value;
  options?: Value;
  indexCalls: { keys: Value; options?: Value; line: number }[];
  /** First generic argument of `new Schema<IUser>(...)`, e.g. `IUser`. */
  typeArg?: string;
}

/** Member names of `interface X { ... }` / `type X = { ... }`, for interface ↔ schema drift checks. */
function collectInterfaces(toks: Token[], vp: ValueParser): Map<string, { name: string; line: number }[]> {
  const map = new Map<string, { name: string; line: number }[]>();
  for (let k = 0; k < toks.length - 2; k++) {
    const t = toks[k];
    if (t.type !== 'ident' || toks[k + 1].type !== 'ident') continue;
    if (t.value !== 'interface' && t.value !== 'type') continue;
    // Find the body `{` (skipping `extends A, B<C>` / `=`), stopping at statement ends.
    let open = k + 2;
    while (open < toks.length && !(toks[open].type === 'punct' && (toks[open].value === '{' || toks[open].value === ';'))) open++;
    if (toks[open]?.value !== '{') continue;
    const close = vp.matching(open);
    const members: { name: string; line: number }[] = [];
    for (let m = open + 1; m < close; m++) {
      const tok = toks[m];
      if (tok.type === 'punct' && OPEN.has(tok.value)) {
        m = vp.matching(m);
        continue;
      }
      const next = toks[m + 1];
      const after = next?.value === '?' ? toks[m + 2] : next;
      if ((tok.type === 'ident' || tok.type === 'string') && after?.type === 'punct' && after.value === ':') {
        if (tok.value !== 'readonly') members.push({ name: tok.value, line: tok.line });
      }
      // Skip the member's type annotation up to `;` / `,` at this depth.
      if (after?.value === ':') {
        let e = m + 1;
        while (e < close && !(toks[e].type === 'punct' && (toks[e].value === ';' || toks[e].value === ','))) {
          if (toks[e].type === 'punct' && OPEN.has(toks[e].value)) e = vp.matching(e);
          e++;
        }
        m = e;
      }
    }
    map.set(toks[k + 1].value, members);
    k = close;
  }
  return map;
}

const isSchemaCallee = (callee: string) => callee === 'Schema' || /\.Schema$/.test(callee);
const DECL_KEYWORDS = new Set(['const', 'let', 'var']);

/** Finds the variable a `new Schema` at token `i` is assigned to, if any. */
function bindingName(toks: Token[], i: number): string | undefined {
  if (toks[i - 1]?.value !== '=' || toks[i - 1].type !== 'punct') return undefined;
  const prev = toks[i - 2];
  // `const UserSchema = new Schema(...)` / `UserSchema = ...` / `exports.UserSchema = ...`
  // (An ident preceded by `:` is a type annotation — `const s: Schema = ...` — handled below.)
  const annotated = toks[i - 3]?.type === 'punct' && toks[i - 3].value === ':';
  if (prev?.type === 'ident' && !annotated) return prev.value;
  // Type-annotated: `const UserSchema: Schema<IUser> = new Schema<IUser>(...)`
  for (let k = i - 2; k >= 1 && k >= i - 64; k--) {
    const t = toks[k];
    if (t.type === 'punct' && (t.value === ';' || t.value === '{' || t.value === '}' || t.value === '=')) break;
    if (t.type === 'punct' && t.value === ':' && toks[k - 1]?.type === 'ident' && DECL_KEYWORDS.has(toks[k - 2]?.value ?? '')) {
      return toks[k - 1].value;
    }
  }
  return undefined;
}

/** Top-level `const name = { ... }` object literals, for `new Schema(definitionVar)`. */
function collectObjectConsts(toks: Token[], vp: ValueParser): Map<string, Value> {
  const map = new Map<string, Value>();
  for (let k = 0; k < toks.length - 3; k++) {
    if (toks[k].type !== 'ident' || !DECL_KEYWORDS.has(toks[k].value) || toks[k + 1].type !== 'ident') continue;
    let j = k + 2;
    if (toks[j]?.value === ':') {
      while (j < toks.length && !(toks[j].type === 'punct' && (toks[j].value === '=' || toks[j].value === ';'))) {
        if (toks[j].type === 'punct' && OPEN.has(toks[j].value)) j = vp.matching(j);
        j++;
      }
    }
    if (toks[j]?.value === '=' && toks[j + 1]?.value === '{' && toks[j + 1].type === 'punct') {
      map.set(toks[k + 1].value, vp.value(j + 1)[0]);
    }
  }
  return map;
}

function discover(code: string): {
  decls: SchemaDecl[];
  warnings: ParseWarning[];
  interfaces: Map<string, { name: string; line: number }[]>;
} {
  const toks = tokenize(code);
  const vp = new ValueParser(toks, code);
  const warnings: ParseWarning[] = [];
  const decls: SchemaDecl[] = [];
  const byTok = new Map<number, SchemaDecl>();
  const byVar = new Map<string, SchemaDecl>();
  const objectConsts = collectObjectConsts(toks, vp);
  const interfaces = collectInterfaces(toks, vp);

  // new Schema(...)
  for (let i = 0; i < toks.length; i++) {
    if (toks[i].type !== 'ident' || toks[i].value !== 'new') continue;
    const [callee, k] = vp.path(i + 1);
    if (!isSchemaCallee(callee)) continue;
    const j = vp.skipGenerics(k);
    if (toks[j]?.value !== '(') continue;
    const close = vp.matching(j);
    const args = vp.list(j + 1, close);
    let definition = args[0];
    if (definition?.kind === 'path' && objectConsts.has(definition.path)) definition = objectConsts.get(definition.path);
    const decl: SchemaDecl = {
      tokIndex: i,
      line: toks[i].line,
      varName: bindingName(toks, i),
      definition,
      options: args[1],
      indexCalls: [],
      typeArg: toks[k]?.value === '<' && toks[k + 1]?.type === 'ident' ? toks[k + 1].value : undefined,
    };
    decls.push(decl);
    byTok.set(i, decl);
    if (decl.varName) byVar.set(decl.varName, decl);
  }

  for (let i = 0; i < toks.length; i++) {
    const t = toks[i];
    if (t.type !== 'ident') continue;

    // model('Name', schemaVar | new Schema(...)), optionally `x.model<IUser>(...)`
    if (t.value === 'model') {
      const j = vp.skipGenerics(i + 1);
      if (toks[j]?.value !== '(' || toks[j + 1]?.type !== 'string' || toks[j + 2]?.value !== ',') continue;
      const modelName = toks[j + 1].value;
      const target = toks[j + 3];
      let decl: SchemaDecl | undefined;
      if (target?.type === 'ident' && target.value === 'new') decl = byTok.get(j + 3);
      else if (target?.type === 'ident') decl = byVar.get(vp.path(j + 3)[0]);
      if (decl) decl.modelName ??= modelName;
      else if (target?.type === 'ident') {
        warnings.push({ message: `model('${modelName}', ${target.value}): schema "${target.value}" is not defined in this code`, line: t.line });
      }
      continue;
    }

    // schemaVar.index({ ... }, { ... })
    const decl = byVar.get(t.value);
    if (decl && toks[i + 1]?.value === '.' && toks[i + 2]?.value === 'index' && toks[i + 3]?.value === '(') {
      const close = vp.matching(i + 3);
      const [keys, options] = vp.list(i + 4, close);
      if (keys?.kind === 'object') decl.indexCalls.push({ keys, options, line: t.line });
    }
  }

  return { decls, warnings, interfaces };
}

// ---------------------------------------------------------------------------
// 4. Mapping helpers
// ---------------------------------------------------------------------------

const prop = (obj: Value | undefined, key: string): Value | undefined =>
  obj?.kind === 'object' ? obj.props.find((p) => p.key === key)?.value : undefined;

/** Truthiness of an option like `required: true`, `required: [true, 'msg']`, `required: () => ...`. */
function isTruthy(v: Value | undefined): boolean {
  if (!v) return false;
  if (v.kind === 'path') return v.path !== 'false' && v.path !== 'undefined' && v.path !== 'null';
  if (v.kind === 'number') return v.value !== 0;
  if (v.kind === 'string') return v.value !== '';
  if (v.kind === 'array') return isTruthy(v.items[0]);
  return true; // functions, objects, raw expressions
}

const firstOf = (v: Value | undefined) => (v?.kind === 'array' ? v.items[0] : v);
const numberOf = (v: Value | undefined) => {
  const f = firstOf(v);
  return f?.kind === 'number' ? f.value : undefined;
};

function sourceOf(v: Value): string {
  switch (v.kind) {
    case 'string': return `'${v.value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
    case 'number': return v.raw;
    case 'regex':
    case 'raw': return v.raw;
    case 'path': return v.path;
    case 'call': return `${v.callee}(${v.args.map(sourceOf).join(', ')})`;
    case 'new': return `new ${v.callee}(${v.args.map(sourceOf).join(', ')})`;
    case 'array': return `[${v.items.map(sourceOf).join(', ')}]`;
    case 'object': return v.props.length ? `{ ${v.props.map((p) => `${p.key}: ${sourceOf(p.value)}`).join(', ')} }` : '{}';
  }
}

/** `mongoose.Schema.Types.ObjectId` / `Types.ObjectId` / `ObjectId` → `ObjectId`, etc. */
function scalarType(path: string): FieldType | undefined {
  const last = path.split('.').pop()!.toLowerCase();
  switch (last) {
    case 'string': return 'String';
    case 'number':
    case 'bigint':
    case 'int32':
    case 'double': return 'Number';
    case 'decimal128':
    case 'decimal': return 'Decimal';
    case 'boolean':
    case 'bool': return 'Boolean';
    case 'date': return 'Date';
    case 'objectid':
    case 'oid': return 'ObjectId';
    case 'uuid': return 'UUID';
    case 'mixed':
    case 'object':
    case 'map':
    case 'buffer': return 'JSON';
    case 'array': return 'Array';
    default: return undefined;
  }
}

function parseTtl(v: Value | undefined): number | undefined {
  if (!v) return undefined;
  if (v.kind === 'number') return v.value;
  if (v.kind !== 'string') return undefined;
  const m = v.value.trim().match(/^(\d+(?:\.\d+)?)\s*(ms|s|m|h|d|w|y)?$/i);
  if (!m) return undefined;
  const mult: Record<string, number> = { ms: 0.001, s: 1, m: 60, h: 3600, d: 86400, w: 604800, y: 31557600 };
  return Math.round(Number(m[1]) * mult[(m[2] ?? 's').toLowerCase()]);
}

function indexDirection(v: Value | undefined): IndexDirection | undefined {
  if (!v) return undefined;
  if (v.kind === 'number') return v.value < 0 ? -1 : 1;
  if (v.kind === 'string' && ['text', 'hashed', '2dsphere'].includes(v.value)) return v.value as IndexDirection;
  return undefined;
}

/** Field draft with an unresolved `ref` target name. */
interface DraftField extends SchemaField {
  refName?: string;
  refLine?: number;
}

interface Ctx {
  warnings: ParseWarning[];
  /** Schema variables that are embedded (sub-schemas), keyed by var name. */
  subSchemas: Map<string, SchemaDecl>;
  depth: number;
}

interface TypeInfo {
  type: FieldType;
  itemType?: FieldType;
  ref?: string;
  nested?: SchemaField[];
  /** Options found on an inner array element, e.g. `[{ type: String, enum: [...] }]`. */
  inner?: Value;
}

/** Resolves what a value in "type position" means. */
function typeOf(v: Value, ctx: Ctx, line: number): TypeInfo {
  switch (v.kind) {
    case 'path': {
      const sub = ctx.subSchemas.get(v.path);
      if (sub) return { type: 'JSON', nested: nestedFields(sub.definition, ctx) };
      const t = scalarType(v.path);
      if (t === 'Array') return { type: 'Array', itemType: 'JSON' };
      if (t) return { type: t };
      ctx.warnings.push({ message: `Unknown type "${v.path}" — treated as String`, line });
      return { type: 'String' };
    }
    case 'string': {
      const t = scalarType(v.value);
      return { type: t && t !== 'Array' ? t : 'String' };
    }
    case 'new':
      if (isSchemaCallee(v.callee)) return { type: 'JSON', nested: nestedFields(v.args[0], ctx) };
      return { type: 'JSON' };
    case 'array': {
      if (v.items.length === 0) return { type: 'Array', itemType: 'JSON' };
      const el = v.items[0];
      const inner = el.kind === 'object' && prop(el, 'type') ? el : undefined;
      const info = fieldShape(el, ctx, line);
      return {
        type: 'Array',
        itemType: info.type === 'Array' ? 'JSON' : info.type,
        ref: info.ref,
        nested: info.nested,
        inner,
      };
    }
    case 'object':
      return { type: 'JSON', nested: nestedFields(v, ctx) };
    default:
      ctx.warnings.push({ message: `Could not understand type expression "${sourceOf(v).slice(0, 40)}" — treated as Mixed`, line });
      return { type: 'JSON' };
  }
}

/** Is `v` an options object (`{ type: X, ... }`) rather than a nested document? */
function isDeclaration(v: Value): boolean {
  if (v.kind !== 'object') return false;
  const t = prop(v, 'type');
  if (!t) return false;
  // `{ type: { type: String } }` is a nested doc with a field named "type".
  return !(t.kind === 'object' && prop(t, 'type'));
}

/** Shape of a full field definition (shorthand or `{ type, ...options }`). */
function fieldShape(v: Value, ctx: Ctx, line: number): TypeInfo & { opts?: Value } {
  if (isDeclaration(v)) {
    const info = typeOf(prop(v, 'type')!, ctx, line);
    const ref = prop(v, 'ref');
    return { ...info, ref: ref?.kind === 'string' ? ref.value : info.ref, opts: v };
  }
  return typeOf(v, ctx, line);
}

function nestedFields(def: Value | undefined, ctx: Ctx): SchemaField[] | undefined {
  if (def?.kind !== 'object' || ctx.depth > 6) return undefined;
  const inner: Ctx = { ...ctx, depth: ctx.depth + 1 };
  return def.props
    .filter((p) => p.key !== '_id')
    .map((p) => {
      const f = buildField(p.key, p.value, p.line, inner);
      delete f.refName;
      delete f.refLine;
      return f as SchemaField;
    });
}

function buildField(name: string, v: Value, line: number, ctx: Ctx): DraftField {
  const shape = fieldShape(v, ctx, line);
  const opts = shape.opts;
  // For arrays like `[{ type: String, enum: [...] }]` options live on the element.
  const elementOpts = shape.inner;
  const opt = (key: string) => prop(opts, key) ?? prop(elementOpts, key);

  const enumVal = opt('enum');
  const enumList = enumVal?.kind === 'object' ? prop(enumVal, 'values') : enumVal;
  const enumOptions =
    enumList?.kind === 'array'
      ? enumList.items.filter((x): x is Extract<Value, { kind: 'string' | 'number' }> => x.kind === 'string' || x.kind === 'number').map((x) => String(x.value))
      : undefined;

  let type = shape.type;
  let itemType = shape.itemType;
  if (enumOptions?.length) {
    if (type === 'String') type = 'Enum';
    else if (type === 'Array' && itemType === 'String') itemType = 'Enum';
  }

  const isString = (type === 'String' || type === 'Enum');
  const min = numberOf(opt(isString ? 'minlength' : 'min') ?? opt('min') ?? opt('minLength'));
  const max = numberOf(opt(isString ? 'maxlength' : 'max') ?? opt('max') ?? opt('maxLength'));
  const match = firstOf(opt('match'));
  const def = prop(opts, 'default');

  const field: DraftField = {
    id: '',
    name,
    type,
    validation: {
      required: isTruthy(prop(opts, 'required')),
      ...(isTruthy(opt('unique')) ? { unique: true } : {}),
      ...(prop(opts, 'select') && !isTruthy(prop(opts, 'select')) ? { select: false } : {}),
      ...(match && (match.kind === 'regex' || match.kind === 'raw') ? { match: match.raw } : {}),
      ...(def ? { defaultVal: sourceOf(def) } : {}),
      ...(min !== undefined ? { min } : {}),
      ...(max !== undefined ? { max } : {}),
      ...(enumOptions?.length ? { enumOptions } : {}),
    },
  };

  const indexOpt = prop(opts, 'index');
  const ttl = parseTtl(prop(opts, 'expires'));
  if (isTruthy(indexOpt) || ttl !== undefined) {
    const direction = indexDirection(indexOpt);
    field.index = {
      indexed: true,
      ...(direction !== undefined && direction !== 1 ? { direction } : {}),
      ...(isTruthy(prop(opts, 'sparse')) ? { sparse: true } : {}),
      ...(ttl !== undefined ? { ttlSeconds: ttl } : {}),
    };
  }

  if (type === 'Array') {
    const minItems = numberOf(prop(opts, 'minItems'));
    const maxItems = numberOf(prop(opts, 'maxItems'));
    field.array = {
      itemType: itemType ?? 'JSON',
      ...(minItems !== undefined ? { minItems } : {}),
      ...(maxItems !== undefined ? { maxItems } : {}),
    };
  }
  if (shape.nested?.length) field.nested = { fields: shape.nested };

  if (shape.ref) {
    field.refName = shape.ref;
    field.refLine = line;
  }
  return field;
}

// ---------------------------------------------------------------------------
// 5. Entry point
// ---------------------------------------------------------------------------

/** `orderItemSchema` → `OrderItem`, `UserSchema` → `User`. */
function nameFromVar(varName: string): string {
  const base = varName.replace(/Schema$/i, '') || varName;
  return base.charAt(0).toUpperCase() + base.slice(1);
}

function sameFieldSet(a: CompoundIndex, fieldIds: string[]): boolean {
  return a.fields.length === fieldIds.length && a.fields.every((f, i) => f.fieldId === fieldIds[i]);
}

/** Compares defaults semantically (`'pro'` ≡ `"pro"`). */
const sameDefault = (a?: string, b?: string) => {
  const norm = (s?: string) => s?.trim().replace(/^(['"`])([\s\S]*)\1$/, '$2');
  return norm(a) === norm(b);
};

/**
 * Parses Mongoose (JS or TS) source into SchemaFlow collections.
 *
 * `existingCollections` is used to keep ids, positions, colors, icons,
 * descriptions and relationship cardinality stable for collections and
 * fields that still exist in the code (matched by name, singular/plural
 * and case-insensitively), and as additional `ref` targets.
 */
export function parseMongooseCode(code: string, existingCollections: CollectionNode[] = []): ParseResult {
  if (!code || !code.trim()) return { success: false, error: 'Empty code input' };

  try {
    const { decls, warnings, interfaces } = discover(code);

    if (decls.length === 0) {
      return {
        success: false,
        error: 'No Mongoose schema found. Expected e.g. `const UserSchema = new Schema({ ... })`.',
        warnings,
      };
    }

    // Embedded sub-schemas: referenced as a field type by another schema and
    // not registered as a model. They become nested JSON fields, not collections.
    const usedAsType = new Set<string>();
    const scan = (v: Value | undefined) => {
      if (!v) return;
      if (v.kind === 'path') usedAsType.add(v.path);
      else if (v.kind === 'array') v.items.forEach(scan);
      else if (v.kind === 'object') v.props.forEach((p) => scan(p.value));
    };
    decls.forEach((d) => scan(d.definition));
    const subSchemas = new Map<string, SchemaDecl>();
    decls.forEach((d) => {
      if (d.varName && !d.modelName && usedAsType.has(d.varName)) subSchemas.set(d.varName, d);
    });
    const insideOther = (d: SchemaDecl) =>
      // `new Schema` written inline as a field value of another schema
      decls.some((o) => o !== d && o.definition?.kind === 'object' && containsTok(o.definition, d.tokIndex));
    const collectionDecls = decls.filter((d) => !(d.varName && subSchemas.has(d.varName)) && !insideOther(d));

    if (collectionDecls.length === 0) {
      return { success: false, error: 'Only embedded sub-schemas were found — no top-level collection schema.', warnings };
    }

    const ctx: Ctx = { warnings, subSchemas, depth: 0 };
    const usedExisting = new Set<string>();

    const collectionOptOf = (d: SchemaDecl) => {
      const v = prop(d.options, 'collection');
      return v?.kind === 'string' ? v.value : undefined;
    };
    const nameOf = (d: SchemaDecl, i: number) =>
      d.modelName ?? collectionOptOf(d) ?? (d.varName ? nameFromVar(d.varName) : `Collection${i + 1}`);

    // Match code schemas to canvas collections. Pass 1: by model / collection name.
    // Pass 2: by schema variable, so renaming `model('User')` → `model('Customer')`
    // renames the existing node instead of deleting it and creating a new one.
    const matchOf = new Map<SchemaDecl, CollectionNode>();
    const claim = (d: SchemaDecl, pred: (c: CollectionNode) => boolean) => {
      const c = existingCollections.find((x) => !usedExisting.has(x.id) && pred(x));
      if (c) {
        matchOf.set(d, c);
        usedExisting.add(c.id);
      }
      return !!c;
    };
    collectionDecls.forEach((d, i) => {
      const name = nameOf(d, i);
      const opt = collectionOptOf(d);
      claim(d, (c) => c.name.toLowerCase() === name.toLowerCase()) ||
        claim(d, (c) => namesMatch(c.name, name)) ||
        (opt !== undefined && claim(d, (c) => namesMatch(c.name, opt)));
    });
    collectionDecls.forEach((d) => {
      if (!matchOf.has(d) && d.varName) claim(d, (c) => namesMatch(c.name, nameFromVar(d.varName!)));
    });
    const seenNames = new Map<string, number>();
    const drafts: { col: CollectionNode; fields: DraftField[]; decl: SchemaDecl; existing?: CollectionNode }[] = [];

    for (const decl of collectionDecls) {
      if (decl.definition?.kind !== 'object') {
        return {
          success: false,
          error: `Schema${decl.varName ? ` "${decl.varName}"` : ''} must be created with an object literal: new Schema({ ... })`,
          errorLine: decl.line,
          warnings,
        };
      }

      const name = nameOf(decl, drafts.length);

      const dupKey = singularize(name.toLowerCase());
      if (seenNames.has(dupKey)) {
        return {
          success: false,
          error: `Duplicate collection "${name}" (also declared on line ${seenNames.get(dupKey)})`,
          errorLine: decl.line,
          warnings,
        };
      }
      seenNames.set(dupKey, decl.line);

      const existing = matchOf.get(decl);

      const existingByName = new Map<string, SchemaField>(existing?.fields.map((f) => [f.name.toLowerCase(), f]) ?? []);
      const fields: DraftField[] = [];
      const seenFields = new Set<string>();

      for (const p of decl.definition.props) {
        if (seenFields.has(p.key)) {
          warnings.push({ message: `Field "${p.key}" is declared twice in ${name}; the last one wins`, line: p.line });
          const idx = fields.findIndex((f) => f.name === p.key);
          fields.splice(idx, 1);
        }
        seenFields.add(p.key);
        const f = buildField(p.key, p.value, p.line, ctx);
        const prev = existingByName.get(p.key.toLowerCase());
        f.id = prev?.id ?? createId('f');
        if (p.key === '_id') f.isPrimaryKey = true;
        if (prev) {
          if (prev.description) f.description = prev.description;
          if (prev.isPrimaryKey && !fields.some((x) => x.isPrimaryKey)) f.isPrimaryKey = true;
          if (f.type === 'JSON' && !f.nested && prev.nested) f.nested = prev.nested;
          if (prev.validation.defaultVal !== undefined && sameDefault(prev.validation.defaultVal, f.validation.defaultVal)) {
            f.validation.defaultVal = prev.validation.defaultVal;
          }
          if (f.index && prev.index?.name) f.index.name = prev.index.name;
          // `unique` already implies an index, so the generator omits `index: true`; keep the flag.
          if (!f.index && f.validation.unique && prev.index?.indexed) f.index = prev.index;
        }
        fields.push(f);
      }

      // Mongoose adds `_id` implicitly; keep the existing PK id so references stay valid.
      if (!fields.some((f) => f.isPrimaryKey)) {
        const prevPk = existing?.fields.find((f) => f.isPrimaryKey);
        fields.unshift({
          id: prevPk && !fields.some((f) => f.id === prevPk.id) ? prevPk.id : createId('f'),
          name: '_id',
          type: 'ObjectId',
          isPrimaryKey: true,
          validation: { required: true },
        });
      } else {
        const pk = fields.find((f) => f.isPrimaryKey)!;
        pk.validation.required = true;
        if (fields[0] !== pk) {
          fields.splice(fields.indexOf(pk), 1);
          fields.unshift(pk);
        }
      }

      // Fields added to the TS interface but not to the schema are pure types:
      // they create nothing in MongoDB, so tell the user where to put them.
      const iface = decl.typeArg ? interfaces.get(decl.typeArg) : undefined;
      if (iface) {
        const implicit = new Set(['_id', 'id', '__v', ...(isTruthy(prop(decl.options, 'timestamps')) ? ['createdAt', 'updatedAt'] : [])]);
        const schemaFields = new Set(fields.map((f) => f.name));
        for (const m of iface) {
          if (schemaFields.has(m.name) || implicit.has(m.name)) continue;
          warnings.push({
            message: `"${m.name}" is only in interface ${decl.typeArg} (a TypeScript type) — add it inside new Schema({ ... })${decl.varName ? ` for ${decl.varName}` : ''} to create it on the canvas`,
            line: m.line,
          });
        }
      }

      // schema.index(...) calls
      const compoundIndexes: CompoundIndex[] = [];
      for (const call of decl.indexCalls) {
        if (call.keys.kind !== 'object') continue;
        const entries = call.keys.props.map((p) => ({ field: fields.find((f) => f.name === p.key), key: p.key, dir: indexDirection(p.value) ?? 1 }));
        const missing = entries.filter((e) => !e.field);
        if (missing.length) {
          warnings.push({ message: `${name}.index(): unknown field${missing.length > 1 ? 's' : ''} ${missing.map((m) => `"${m.key}"`).join(', ')} — index skipped`, line: call.line });
          continue;
        }
        const unique = isTruthy(prop(call.options, 'unique'));
        const sparse = isTruthy(prop(call.options, 'sparse'));
        const ttl = parseTtl(prop(call.options, 'expireAfterSeconds'));
        const idxName = prop(call.options, 'name');
        if (entries.length === 1) {
          const f = entries[0].field!;
          if (unique && ttl === undefined) {
            f.validation.unique = true;
            continue;
          }
          f.index = {
            ...f.index,
            indexed: true,
            ...(entries[0].dir !== 1 ? { direction: entries[0].dir } : {}),
            ...(sparse ? { sparse: true } : {}),
            ...(ttl !== undefined ? { ttlSeconds: ttl } : {}),
            ...(idxName?.kind === 'string' ? { name: idxName.value } : {}),
          };
          continue;
        }
        const fieldIds = entries.map((e) => e.field!.id);
        const prevCi = existing?.compoundIndexes?.find((ci) => sameFieldSet(ci, fieldIds));
        compoundIndexes.push({
          id: prevCi?.id ?? createId('idx'),
          ...(idxName?.kind === 'string' ? { name: idxName.value } : prevCi?.name ? { name: prevCi.name } : {}),
          fields: entries.map((e) => ({ fieldId: e.field!.id, direction: e.dir })),
          ...(unique ? { unique: true } : {}),
          ...(sparse ? { sparse: true } : {}),
        });
      }

      const col: CollectionNode = {
        id: existing?.id ?? createId('col'),
        // Keep the canvas spelling (`Users`) unless the model was renamed in code.
        name: existing && namesMatch(existing.name, name) ? existing.name : name,
        icon: existing?.icon ?? 'Database',
        colorTag: existing?.colorTag ?? '#4A6585',
        position: existing?.position ?? { x: 0, y: 0 },
        fields,
        timestamps: isTruthy(prop(decl.options, 'timestamps')),
        ...(existing?.description ? { description: existing.description } : {}),
        ...(compoundIndexes.length ? { compoundIndexes } : {}),
      };
      drafts.push({ col, fields, decl, existing });
    }

    // Resolve refs: parsed collections first, then the rest of the canvas.
    const targets = [...drafts.map((d) => d.col), ...existingCollections.filter((c) => !usedExisting.has(c.id))];
    let relationships = 0;
    for (const { fields, existing } of drafts) {
      for (const f of fields) {
        const refName = f.refName;
        const refLine = f.refLine;
        delete f.refName;
        delete f.refLine;
        if (!refName) continue;
        const target =
          targets.find((c) => c.name.toLowerCase() === refName.toLowerCase()) ??
          targets.find((c) => namesMatch(c.name, refName)) ??
          // A model renamed in this edit is still reachable by its old canvas name.
          drafts.find((d) => d.existing && namesMatch(d.existing.name, refName))?.col;
        const targetPk = target?.fields.find((x) => x.isPrimaryKey) ?? target?.fields[0];
        if (!target || !targetPk) {
          warnings.push({ message: `ref: '${refName}' on "${f.name}" does not match any collection — no relationship created`, line: refLine });
          continue;
        }
        const isArray = f.type === 'Array';
        let relationType: RelationshipType = isArray ? 'many-to-many' : f.validation.unique ? 'one-to-one' : 'one-to-many';
        const prev = existing?.fields.find((x) => x.id === f.id);
        const prevType = prev?.foreignKeyRef?.targetCollectionId === target.id ? prev.foreignKeyRef.relationType : undefined;
        // Keep a user-chosen cardinality when the code is still compatible with it.
        if (prevType && (prevType === 'many-to-many') === isArray) relationType = prevType;
        f.isForeignKey = true;
        f.foreignKeyRef = { targetCollectionId: target.id, targetFieldId: targetPk.id, relationType };
        if (isArray && f.array) f.array.itemRefCollectionId = target.id;
        relationships++;
      }
    }

    const collections = drafts.map((d) => d.col);
    const fieldCount = collections.reduce((n, c) => n + c.fields.filter((f) => !f.isPrimaryKey).length, 0);
    return {
      success: true,
      collections,
      warnings,
      stats: { collections: collections.length, fields: fieldCount, relationships },
    };
  } catch (err) {
    if (err instanceof ParseError) return { success: false, error: err.message, errorLine: err.line };
    return { success: false, error: (err as Error)?.message || 'Parser encountered an unexpected token' };
  }
}

/** Whether a `new Schema` token index lies inside an object value's token span. */
function containsTok(v: Value, tokIndex: number): boolean {
  if (v.kind === 'new') return v.tokStart === tokIndex || v.args.some((a) => containsTok(a, tokIndex));
  if (v.kind === 'object') return v.props.some((p) => containsTok(p.value, tokIndex));
  if (v.kind === 'array') return v.items.some((x) => containsTok(x, tokIndex));
  if (v.kind === 'call') return v.args.some((a) => containsTok(a, tokIndex));
  return false;
}
