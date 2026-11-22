import React from 'react';
import { Highlight, type PrismTheme } from 'prism-react-renderer';

/**
 * Prism theme that resolves every token color from the active `--code-*` CSS
 * variables, so syntax colors follow the Paper / Carbon theme automatically.
 */
export const themeAwarePrismTheme: PrismTheme = {
  plain: { color: 'var(--code-text)', backgroundColor: 'transparent' },
  styles: [
    { types: ['comment', 'prolog', 'doctype', 'cdata'], style: { color: 'var(--code-comment)', fontStyle: 'italic' } },
    { types: ['punctuation'], style: { color: 'var(--code-punctuation)' } },
    { types: ['property', 'tag', 'boolean', 'number', 'constant', 'symbol', 'deleted'], style: { color: 'var(--code-number)' } },
    { types: ['selector', 'attr-name', 'string', 'char', 'builtin', 'inserted'], style: { color: 'var(--code-string)' } },
    { types: ['operator', 'entity', 'url'], style: { color: 'var(--code-punctuation)' } },
    { types: ['atrule', 'attr-value', 'keyword'], style: { color: 'var(--code-keyword)' } },
    { types: ['function', 'class-name'], style: { color: 'var(--code-function)' } },
    { types: ['regex', 'important', 'variable'], style: { color: 'var(--code-type)' } },
  ],
};

/**
 * Read-only syntax highlighter with a line-number gutter. Highlights either a
 * single line (`highlightedLineIndex`) or an inclusive range (`highlightRange`).
 */
export function CodeViewer({
  code,
  language,
  highlightedLineIndex = -1,
  highlightRange,
  lineRefs,
}: {
  code: string;
  language: string;
  highlightedLineIndex?: number;
  /** 0-based inclusive [start, end]; rendered as a soft band with an accent rail. */
  highlightRange?: [number, number] | null;
  lineRefs?: React.MutableRefObject<Record<number, HTMLDivElement | null>>;
}) {
  return (
    <Highlight theme={themeAwarePrismTheme} code={code} language={language as any}>
      {({ className, style, tokens, getLineProps, getTokenProps }) => (
        <pre
          className={`${className} font-mono text-[13px] leading-[1.65] bg-[var(--code-bg)] text-[var(--code-text)] selection:bg-accent-soft py-3`}
          style={{ ...style, background: 'var(--code-bg)', color: 'var(--code-text)' }}
        >
          {tokens.map((line, i) => {
            const isHighlighted = i === highlightedLineIndex;
            const inRange = !!highlightRange && i >= highlightRange[0] && i <= highlightRange[1];
            return (
              <div
                key={i}
                ref={(el) => {
                  if (lineRefs) lineRefs.current[i] = el;
                }}
                {...getLineProps({ line })}
                className={`flex transition-colors duration-150 ${
                  isHighlighted
                    ? 'bg-[var(--code-line-highlight)] border-l-2 border-accent pl-1 font-semibold'
                    : inRange
                      ? 'bg-[var(--code-line-highlight)] border-l-2 border-accent'
                      : 'border-l-2 border-transparent hover:bg-surface-hover/50'
                }`}
              >
                <span className="w-12 shrink-0 select-none text-right pr-3 pl-2 text-[12px] font-mono bg-[var(--code-gutter-bg)] text-[var(--code-gutter-text)] border-r border-line">
                  {i + 1}
                </span>
                <span className="flex-1 pl-4 pr-3 overflow-x-auto">
                  {line.map((token, key) => (
                    <span key={key} {...getTokenProps({ token })} />
                  ))}
                </span>
              </div>
            );
          })}
        </pre>
      )}
    </Highlight>
  );
}
