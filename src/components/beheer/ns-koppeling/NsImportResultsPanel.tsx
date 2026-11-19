import React, { useMemo, useState } from 'react';
import type {
  NsSyncFieldChange,
  NsSyncLocationResult,
  NsSyncSummary,
} from '~/server/services/ns-connector/sync';

const METADATA_FIELDS = new Set(['DateModified', 'EditorModified']);

export type NsImportResultFilter =
  | 'all'
  | 'created'
  | 'metadataChanged'
  | 'unchanged'
  | 'skipped'
  | 'error';

function meaningfulChanges(changes?: NsSyncFieldChange[]): NsSyncFieldChange[] {
  return (changes ?? []).filter((c) => !METADATA_FIELDS.has(c.field));
}

function isUnchangedUpdate(r: NsSyncLocationResult): boolean {
  return r.action === 'updated' && meaningfulChanges(r.changes).length === 0;
}

function hasMetadataChanges(r: NsSyncLocationResult): boolean {
  return r.action === 'updated' && meaningfulChanges(r.changes).length > 0;
}

function formatChangeValue(value: unknown): string {
  if (value === null || value === undefined) return '—';
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'boolean') return value ? 'ja' : 'nee';
  const s = String(value);
  return s.length > 120 ? `${s.slice(0, 117)}…` : s;
}

const ACTION_LABELS: Record<NsSyncLocationResult['action'], string> = {
  created: 'Nieuw',
  updated: 'Bijgewerkt',
  skipped: 'Overgeslagen',
  error: 'Fout',
};

const ACTION_BADGE: Record<NsSyncLocationResult['action'], string> = {
  created: 'bg-green-100 text-green-800',
  updated: 'bg-blue-100 text-blue-800',
  skipped: 'bg-gray-100 text-gray-700',
  error: 'bg-red-100 text-red-800',
};

type Props = {
  summary: NsSyncSummary;
};

export const NsImportResultsPanel: React.FC<Props> = ({ summary }) => {
  const [excludeUnchanged, setExcludeUnchanged] = useState(true);
  const [resultFilter, setResultFilter] = useState<NsImportResultFilter>('all');
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(new Set());

  const counts = useMemo(() => {
    const c = { created: 0, metadataChanged: 0, unchanged: 0, skipped: 0, error: 0 };
    for (const r of summary.results) {
      if (r.action === 'created') c.created++;
      else if (r.action === 'updated') {
        if (isUnchangedUpdate(r)) c.unchanged++;
        else c.metadataChanged++;
      } else if (r.action === 'skipped') c.skipped++;
      else if (r.action === 'error') c.error++;
    }
    return c;
  }, [summary.results]);

  const filteredRows = useMemo(() => {
    return summary.results.filter((r) => {
      if (resultFilter === 'created' && r.action !== 'created') return false;
      if (resultFilter === 'metadataChanged' && !hasMetadataChanges(r)) return false;
      if (resultFilter === 'unchanged' && !isUnchangedUpdate(r)) return false;
      if (resultFilter === 'skipped' && r.action !== 'skipped') return false;
      if (resultFilter === 'error' && r.action !== 'error') return false;
      if (excludeUnchanged && isUnchangedUpdate(r)) return false;
      return true;
    });
  }, [summary.results, resultFilter, excludeUnchanged]);

  const rowKey = (r: NsSyncLocationResult, index: number) =>
    `${r.queryId}-${r.stallingsId || 'skip'}-${index}`;

  const toggleExpanded = (key: string) => {
    setExpandedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const renderChangesCell = (r: NsSyncLocationResult, key: string) => {
    const changes = meaningfulChanges(r.changes);
    if (r.action === 'created') {
      const n = changes.length;
      return (
        <button
          type="button"
          onClick={() => toggleExpanded(key)}
          className="text-left text-blue-600 hover:text-blue-800 underline-offset-2 hover:underline"
        >
          Nieuw ({n} velden){expandedKeys.has(key) ? ' ▲' : ' ▼'}
        </button>
      );
    }
    if (r.action === 'updated') {
      if (changes.length === 0) {
        return <span className="text-gray-500 italic">Alleen tijdstempel gewijzigd</span>;
      }
      if (changes.length <= 3 && !expandedKeys.has(key)) {
        return (
          <ul className="list-disc list-inside text-gray-700 space-y-0.5">
            {changes.map((c, i) => (
              <li key={i}>
                <span className="font-mono text-xs">{c.field}</span>: {formatChangeValue(c.from)} →{' '}
                {formatChangeValue(c.to)}
              </li>
            ))}
          </ul>
        );
      }
      return (
        <button
          type="button"
          onClick={() => toggleExpanded(key)}
          className="text-left text-blue-600 hover:text-blue-800 underline-offset-2 hover:underline"
        >
          {changes.length} wijzigingen{expandedKeys.has(key) ? ' ▲' : ' ▼'}
        </button>
      );
    }
    return <span className="text-gray-400">—</span>;
  };

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
      <h2 className="text-xl font-bold text-gray-900 mb-2">
        Import {summary.dryRun ? '(voorbeeld)' : '(uitgevoerd)'}
      </h2>
      <p className="text-sm text-gray-600 mb-4">
        {summary.created} nieuw · {summary.updated} bijgewerkt ({counts.unchanged} alleen tijdstempel gewijzigd) ·{' '}
        {summary.skipped} overgeslagen · {summary.errors} fouten
        {summary.aborted && summary.abortReason ? ` · afgebroken: ${summary.abortReason}` : ''}
      </p>

      <div className="flex flex-col gap-3 mb-4 sm:flex-row sm:flex-wrap sm:items-end">
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-gray-700">Resultaat</span>
          <select
            value={resultFilter}
            onChange={(e) => setResultFilter(e.target.value as NsImportResultFilter)}
            className="border border-gray-300 rounded-md px-3 py-2 text-sm min-w-[12rem]"
          >
            <option value="all">Alles ({summary.results.length})</option>
            <option value="created">Nieuw ({counts.created})</option>
            <option value="metadataChanged">metadata gewijzigd ({counts.metadataChanged})</option>
            <option value="unchanged">Alleen tijdstempel gewijzigd ({counts.unchanged})</option>
            <option value="skipped">Overgeslagen ({counts.skipped})</option>
            <option value="error">Fout ({counts.error})</option>
          </select>
        </label>

        <label className="flex items-center gap-2 text-sm text-gray-700 pb-2 sm:pb-0">
          <input
            type="checkbox"
            checked={excludeUnchanged}
            onChange={(e) => setExcludeUnchanged(e.target.checked)}
            className="rounded border-gray-300"
          />
          Verberg &quot;Alleen tijdstempel gewijzigd&quot;
        </label>
      </div>

      <p className="text-xs text-gray-500 mb-2">
        {filteredRows.length} van {summary.results.length} rijen
        {summary.dryRun ? ' · geen database-wijzigingen (dry run)' : ''}
      </p>

      <div className="overflow-x-auto max-h-[32rem] overflow-y-auto border border-gray-200 rounded-lg">
        <table className="min-w-full divide-y divide-gray-200 text-sm">
          <thead className="bg-gray-50 sticky top-0 z-10">
            <tr>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">StallingsID</th>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Naam</th>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Bron</th>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Resultaat</th>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Reden</th>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Wijzigingen</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-100">
            {filteredRows.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-3 py-8 text-center text-gray-500">
                  Geen rijen voor dit filter.
                </td>
              </tr>
            ) : (
              filteredRows.map((r, index) => {
                const key = rowKey(r, index);
                const expanded = expandedKeys.has(key);
                const changes = meaningfulChanges(r.changes);
                return (
                  <React.Fragment key={key}>
                    <tr className="hover:bg-gray-50">
                      <td className="px-3 py-2 whitespace-nowrap font-mono text-xs">{r.stallingsId || '—'}</td>
                      <td className="px-3 py-2 max-w-[14rem] truncate" title={r.title}>
                        {r.title}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap text-gray-600">{r.queryId}</td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        <span
                          className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${ACTION_BADGE[r.action]}`}
                        >
                          {ACTION_LABELS[r.action]}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-red-700 max-w-[16rem]">{r.message ?? '—'}</td>
                      <td className="px-3 py-2 min-w-[12rem]">{renderChangesCell(r, key)}</td>
                    </tr>
                    {expanded && changes.length > 0 && (
                      <tr className="bg-gray-50">
                        <td colSpan={6} className="px-3 py-2">
                          <ul className="grid gap-1 sm:grid-cols-2 text-xs text-gray-700 font-mono">
                            {changes.map((c, i) => (
                              <li key={i} className="break-all">
                                <span className="font-semibold text-gray-900">{c.field}</span>:{' '}
                                {formatChangeValue(c.from)} → {formatChangeValue(c.to)}
                              </li>
                            ))}
                          </ul>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
