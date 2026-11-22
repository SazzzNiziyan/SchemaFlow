import React, { useMemo, useState } from 'react';
import { useReactFlow } from '@xyflow/react';
import {
  AlertTriangle,
  AlertCircle,
  Info,
  CheckCircle2,
  X,
  Sparkles,
  Wrench,
  Search,
  ExternalLink,
  ShieldCheck,
  Zap,
} from 'lucide-react';
import { useSchemaStore } from '../store/useSchemaStore';
import { useUIStore } from '../store/useUIStore';
import { useSchemaAudit, type AuditIssue, type AuditSeverity } from '../utils/schemaAuditor';
import { executeAutoFix, executeFixAll } from '../utils/schemaAutoFix';

export const SchemaAuditorDrawer: React.FC = () => {
  const isOpen = useUIStore((s) => s.isAuditorOpen);
  const setIsOpen = useUIStore((s) => s.setAuditorOpen);
  const focusedIssueId = useUIStore((s) => s.focusedIssueId);
  const collections = useSchemaStore((s) => s.collections);
  const audit = useSchemaAudit();
  const { setCenter, fitView } = useReactFlow();

  const [severityFilter, setSeverityFilter] = useState<'all' | AuditSeverity>('all');
  const [searchFilter, setSearchFilter] = useState('');

  const filteredIssues = useMemo(() => {
    return audit.issues.filter((issue) => {
      if (severityFilter !== 'all' && issue.severity !== severityFilter) return false;
      if (searchFilter.trim()) {
        const q = searchFilter.toLowerCase();
        return (
          issue.title.toLowerCase().includes(q) ||
          issue.explanation.toLowerCase().includes(q) ||
          issue.ruleCode.toLowerCase().includes(q) ||
          issue.mongoImpact.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [audit.issues, severityFilter, searchFilter]);

  if (!isOpen) return null;

  const locateIssue = (issue: AuditIssue) => {
    const col = collections.find((c) => c.id === issue.collectionId);
    if (!col) return;
    useSchemaStore.getState().setSelectedField(issue.fieldId ?? null, issue.collectionId);
    setCenter(col.position.x + 150, col.position.y + 120, { zoom: 1.05, duration: 400 });
  };

  const handleFix = (e: React.MouseEvent, issue: AuditIssue) => {
    e.stopPropagation();
    executeAutoFix(issue);
    locateIssue(issue);
  };

  const handleFixAll = () => {
    executeFixAll(audit.issues);
    setTimeout(() => fitView({ duration: 350, padding: 0.15 }), 100);
  };

  // Score color formatting
  const score = audit.score;
  const scoreColor =
    score >= 85
      ? 'text-emerald-700 dark:text-emerald-400 border-emerald-500/30 bg-emerald-500/10'
      : score >= 60
        ? 'text-amber-700 dark:text-amber-400 border-amber-500/30 bg-amber-500/10'
        : 'text-rose-700 dark:text-rose-400 border-rose-500/30 bg-rose-500/10';

  const scoreLabel =
    score >= 90
      ? 'Optimal Architecture'
      : score >= 75
        ? 'Minor Optimizations Needed'
        : score >= 50
          ? 'Performance Bottlenecks Detected'
          : 'Critical Anti-Patterns Detected';

  const fixableCount = audit.issues.filter((i) => i.canAutoFix).length;

  return (
    <aside
      aria-label="Schema Anti-Pattern & Index Auditor"
      className="fixed top-14 right-3 z-30 flex h-[calc(100vh-72px)] w-[440px] max-w-[calc(100vw-24px)] flex-col rounded-[1.25rem] glass-panel shadow-2xl transition-all duration-300"
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-[var(--glass-border)] px-5 py-4">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-indigo-500/30 bg-indigo-500/10 text-indigo-400">
            <ShieldCheck className="h-4 w-4" />
          </div>
          <div>
            <h2 className="text-sm font-semibold tracking-[-0.01em] text-[var(--glass-text-primary)]">Schema Health Auditor</h2>
            <p className="text-[11px] text-[var(--glass-text-secondary)]">MongoDB Anti-Pattern & Index Analysis</p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setIsOpen(false)}
          className="flex h-7 w-7 items-center justify-center rounded-md text-[var(--glass-text-secondary)] transition hover:bg-[var(--glass-hover)] hover:text-[var(--glass-text-primary)]"
          aria-label="Close auditor"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Health Score Card */}
      <div className="border-b border-[var(--glass-border)] bg-[var(--glass-surface-elevated)] p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div
              className={`flex h-14 w-14 items-center justify-center rounded-2xl border text-xl font-bold font-mono ${scoreColor}`}
            >
              {score}
            </div>
            <div>
              <div className="text-xs font-semibold text-[var(--glass-text-primary)]">{scoreLabel}</div>
              <div className="mt-0.5 text-[11px] text-[var(--glass-text-secondary)]">
                {audit.issues.length === 0
                  ? 'All 8 MongoDB engineering rules passing cleanly.'
                  : `${audit.criticalCount} critical, ${audit.warningCount} warnings, ${audit.infoCount} notes`}
              </div>
            </div>
          </div>

          {fixableCount > 1 && (
            <button
              type="button"
              onClick={handleFixAll}
              className="flex items-center gap-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/15 px-3 py-1.5 text-xs font-medium text-emerald-600 dark:text-emerald-300 transition hover:bg-emerald-500/25 active:scale-95"
              title="Apply all safe 1-Click fixes in a single undo step"
            >
              <Zap className="h-3.5 w-3.5" />
              Fix All ({fixableCount})
            </button>
          )}
        </div>

        {/* Severity Tabs */}
        <div className="mt-4 flex items-center gap-1.5 text-xs">
          <button
            type="button"
            onClick={() => setSeverityFilter('all')}
            className={`rounded-md px-2.5 py-1 font-medium transition ${
              severityFilter === 'all'
                ? 'bg-[var(--glass-hover)] text-[var(--glass-text-primary)] border border-[var(--glass-border)]'
                : 'text-[var(--glass-text-secondary)] hover:bg-[var(--glass-hover)] hover:text-[var(--glass-text-primary)]'
            }`}
          >
            All ({audit.issues.length})
          </button>
          <button
            type="button"
            onClick={() => setSeverityFilter('critical')}
            className={`flex items-center gap-1 rounded-md px-2 py-1 font-medium transition ${
              severityFilter === 'critical'
                ? 'bg-rose-500/20 text-rose-600 dark:text-rose-300 border border-rose-500/30'
                : 'text-rose-500 hover:bg-rose-500/10'
            }`}
          >
            <AlertTriangle className="h-3 w-3" />
            Critical ({audit.criticalCount})
          </button>
          <button
            type="button"
            onClick={() => setSeverityFilter('warning')}
            className={`flex items-center gap-1 rounded-md px-2 py-1 font-medium transition ${
              severityFilter === 'warning'
                ? 'bg-amber-500/20 text-amber-600 dark:text-amber-300 border border-amber-500/30'
                : 'text-amber-500 hover:bg-amber-500/10'
            }`}
          >
            <AlertCircle className="h-3 w-3" />
            Warnings ({audit.warningCount})
          </button>
          <button
            type="button"
            onClick={() => setSeverityFilter('info')}
            className={`flex items-center gap-1 rounded-md px-2 py-1 font-medium transition ${
              severityFilter === 'info'
                ? 'bg-blue-500/20 text-blue-600 dark:text-blue-300 border border-blue-500/30'
                : 'text-[var(--glass-text-secondary)] hover:bg-[var(--glass-hover)]'
            }`}
          >
            <Info className="h-3 w-3" />
            Info ({audit.infoCount})
          </button>
        </div>
      </div>

      {/* Issues List */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {filteredIssues.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
              <CheckCircle2 className="h-6 w-6" />
            </div>
            <p className="mt-3 text-sm font-semibold text-[var(--glass-text-primary)]">No Issues Found</p>
            <p className="mt-1 text-xs text-[var(--glass-text-secondary)] max-w-[260px]">
              {severityFilter === 'all'
                ? 'Your MongoDB schema satisfies all production indexing, BSON size, and security standards.'
                : `No ${severityFilter} severity findings.`}
            </p>
          </div>
        ) : (
          filteredIssues.map((issue) => {
            const isTargetCol = collections.find((c) => c.id === issue.collectionId);
            const isTargetField = isTargetCol?.fields.find((f) => f.id === issue.fieldId);
            const isFocused = focusedIssueId === issue.id;

            return (
              <div
                key={issue.id}
                onClick={() => locateIssue(issue)}
                className={`group relative rounded-xl border p-3.5 transition cursor-pointer ${
                  isFocused
                    ? 'border-indigo-500/60 bg-indigo-500/10 shadow-lg'
                    : 'border-[var(--glass-border)] bg-[var(--glass-surface-elevated)] hover:bg-[var(--glass-hover)]'
                }`}
              >
                {/* Header row: Severity Badge + Rule Code */}
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <SeverityBadge severity={issue.severity} />
                    <span className="font-mono text-[10.5px] uppercase tracking-wider text-[var(--glass-text-secondary)]">
                      {issue.ruleCode}
                    </span>
                  </div>

                  {isTargetCol && (
                    <span className="font-mono text-[11px] text-[var(--glass-text-secondary)]">
                      {isTargetCol.name}
                      {isTargetField ? `.${isTargetField.name}` : ''}
                    </span>
                  )}
                </div>

                {/* Title */}
                <h4 className="mt-2 text-[13px] font-semibold text-[var(--glass-text-primary)] group-hover:text-accent transition-colors">
                  {issue.title}
                </h4>

                {/* Explanation */}
                <p className="mt-1 text-[11.5px] leading-relaxed text-[var(--glass-text-secondary)]">{issue.explanation}</p>

                {/* MongoDB Impact Callout */}
                <div className="mt-2.5 rounded-lg border border-amber-500/20 bg-amber-500/10 px-2.5 py-1.5 text-[11px] text-amber-700 dark:text-amber-300">
                  <span className="font-semibold text-amber-800 dark:text-amber-200">⚡ Impact: </span>
                  {issue.mongoImpact}
                </div>

                {/* Action Bar */}
                <div className="mt-3 flex items-center justify-between pt-2 border-t border-[var(--glass-border)]">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      locateIssue(issue);
                    }}
                    className="flex items-center gap-1 text-[11px] text-[var(--glass-text-secondary)] hover:text-[var(--glass-text-primary)] transition"
                  >
                    <ExternalLink className="h-3 w-3" />
                    Locate on canvas
                  </button>

                  {issue.canAutoFix && (
                    <button
                      type="button"
                      onClick={(e) => handleFix(e, issue)}
                      className="flex items-center gap-1.5 rounded-md border border-indigo-500/40 bg-indigo-500/20 px-2.5 py-1 text-[11.5px] font-medium text-indigo-700 dark:text-indigo-300 transition hover:bg-indigo-500/35 hover:text-indigo-900 dark:hover:text-white active:scale-95"
                    >
                      <Wrench className="h-3 w-3" />
                      {issue.fixLabel}
                    </button>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </aside>
  );
};

function SeverityBadge({ severity }: { severity: AuditSeverity }) {
  if (severity === 'critical') {
    return (
      <span className="inline-flex items-center gap-1 rounded-[4px] border border-rose-500/30 bg-rose-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-rose-700 dark:text-rose-300 uppercase tracking-wide">
        <AlertTriangle className="h-3 w-3" />
        Critical
      </span>
    );
  }
  if (severity === 'warning') {
    return (
      <span className="inline-flex items-center gap-1 rounded-[4px] border border-amber-500/30 bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700 dark:text-amber-300 uppercase tracking-wide">
        <AlertCircle className="h-3 w-3" />
        Warning
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-[4px] border border-blue-500/30 bg-blue-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-blue-700 dark:text-blue-300 uppercase tracking-wide">
      <Info className="h-3 w-3" />
      Info
    </span>
  );
}
