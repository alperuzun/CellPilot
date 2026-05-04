import React, { useState, useMemo, useEffect } from 'react';
import { DatasetInfo, api } from '../../services/api';
import { useTheme } from '../../theme/ThemeContext';
import UMAPExplorer from './UMAPExplorer';
import MergeSubclusterModal from './MergeSubclusterModal';
import {
  Database,
  Calendar,
  HardDrive,
  ArrowUpDown,
  FlaskConical,
  ChevronRight,
  FolderOpen,
  ArrowLeft,
  Search,
  Trash2,
} from 'lucide-react';

interface VisualizationDashboardProps {
  initialPath?: string;
  onBack: () => void;
}

type SortKey = 'name' | 'date' | 'analysis_type' | 'size_mb';
type SortDir = 'asc' | 'desc';

function formatSize(mb: number): string {
  if (mb >= 1024) return `${(mb / 1024).toFixed(1)} GB`;
  if (mb > 0) return `${mb.toFixed(1)} MB`;
  return '--';
}

function formatDate(dateStr: string): string {
  if (!dateStr) return '--';
  // Try to parse common formats
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function analysisTypeBadge(type: string, colors: ReturnType<typeof useTheme>['colors'], isDark: boolean) {
  const typeConfig: Record<string, { label: string; bg: string; text: string }> = {
    annotation: { label: 'Annotation', bg: colors.accentSubtle, text: colors.accentText },
    subcluster: { label: 'Subcluster', bg: isDark ? '#2d1b4e' : '#f3e8ff', text: isDark ? '#c084fc' : '#7c3aed' },
    unknown: { label: 'Unknown', bg: colors.bgTertiary, text: colors.textMuted },
  };
  const cfg = typeConfig[type] || typeConfig.unknown;
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium"
      style={{ background: cfg.bg, color: cfg.text }}
    >
      {cfg.label}
    </span>
  );
}

export default function VisualizationDashboard({ initialPath, onBack }: VisualizationDashboardProps) {
  const { colors, theme } = useTheme();
  const isDark = theme === 'dark';

  const [pathStack, setPathStack] = useState<string[]>(initialPath ? [initialPath] : []);
  const [datasets, setDatasets] = useState<DatasetInfo[]>([]);
  const [loadingDatasets, setLoadingDatasets] = useState(false);
  const [showMergeModal, setShowMergeModal] = useState(false);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [deletingPath, setDeletingPath] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<DatasetInfo | null>(null);

  const handleDeleteDataset = async (dataset: DatasetInfo) => {
    setDeletingPath(dataset.path);
    try {
      await api.deleteDataset(dataset.path);
      setDatasets(prev => prev.filter(d => d.path !== dataset.path));
      setConfirmDelete(null);
    } catch (err) {
      console.error('Failed to delete dataset:', err);
      alert(`Failed to delete dataset: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setDeletingPath(null);
    }
  };

  // Sort & filter
  const [sortKey, setSortKey] = useState<SortKey>('date');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [searchQuery, setSearchQuery] = useState('');

  React.useEffect(() => {
    if (pathStack.length === 0) {
      const fetchDatasets = async () => {
        setLoadingDatasets(true);
        try {
          const response = await api.getAvailableDatasets();
          setDatasets(response.datasets);
        } catch (error) {
          console.error('Failed to fetch datasets:', error);
        } finally {
          setLoadingDatasets(false);
        }
      };
      fetchDatasets();
    }
  }, [pathStack.length]);

  const currentPath = pathStack[pathStack.length - 1];
  const isSubcluster = pathStack.length > 1;
  const parentPath = pathStack.length > 1 ? pathStack[pathStack.length - 2] : null;

  // Fetch parent label info for subcluster header
  const [parentInfo, setParentInfo] = useState<{ label: string; source: string } | null>(null);
  useEffect(() => {
    if (!isSubcluster || !currentPath) {
      setParentInfo(null);
      return;
    }
    let cancelled = false;
    api.getVisualizationData(currentPath).then(d => {
      if (!cancelled && d?.parent_info) {
        setParentInfo({ label: d.parent_info.label, source: d.parent_info.source });
      }
    }).catch(() => { /* silent */ });
    return () => { cancelled = true; };
  }, [isSubcluster, currentPath]);

  const handlePushPath = (path: string) => {
    setPathStack(prev => [...prev, path]);
  };

  const handlePopPath = () => {
    setPathStack(prev => {
      if (prev.length <= 1) {
        onBack();
        return prev;
      }
      return prev.slice(0, -1);
    });
  };

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir(key === 'date' ? 'desc' : 'asc');
    }
  };

  const filteredAndSorted = useMemo(() => {
    let list = datasets;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        d => d.name.toLowerCase().includes(q) || d.analysis_type.toLowerCase().includes(q)
      );
    }
    const sorted = [...list].sort((a, b) => {
      let cmp = 0;
      if (sortKey === 'name') cmp = a.name.localeCompare(b.name);
      else if (sortKey === 'date') cmp = a.date.localeCompare(b.date);
      else if (sortKey === 'analysis_type') cmp = a.analysis_type.localeCompare(b.analysis_type);
      else if (sortKey === 'size_mb') cmp = a.size_mb - b.size_mb;
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return sorted;
  }, [datasets, searchQuery, sortKey, sortDir]);

  // ── Dataset chooser ──────────────────────────────────────────────
  if (!currentPath) {
    const SortHeader = ({
      label,
      colKey,
      icon,
      className = '',
    }: {
      label: string;
      colKey: SortKey;
      icon?: React.ReactNode;
      className?: string;
    }) => (
      <button
        onClick={() => toggleSort(colKey)}
        className={`flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider transition-colors group ${className}`}
        style={{ color: sortKey === colKey ? colors.accentText : colors.textMuted }}
      >
        {icon}
        {label}
        <ArrowUpDown
          size={12}
          style={{
            opacity: sortKey === colKey ? 1 : 0,
            color: colors.accentText,
          }}
          className="group-hover:opacity-100 transition-opacity"
        />
      </button>
    );

    return (
      <div className="h-full flex flex-col" style={{ background: colors.bgPrimary }}>
        {/* Page header */}
        <div
          className="shrink-0 px-8 py-6 border-b"
          style={{ background: colors.bgSecondary, borderColor: colors.borderPrimary }}
        >
          <div className="max-w-5xl mx-auto flex items-center justify-between">
            <div>
              <h2
                className="text-2xl font-bold tracking-tight"
                style={{ color: colors.textPrimary }}
              >
                Datasets
              </h2>
              <p className="text-sm mt-1" style={{ color: colors.textMuted }}>
                {datasets.length} analysis {datasets.length === 1 ? 'result' : 'results'} available
              </p>
            </div>

            {/* Search */}
            <div className="relative">
              <Search
                size={16}
                className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
                style={{ color: colors.textMuted }}
              />
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search datasets..."
                className="pl-9 pr-4 py-2 text-sm rounded-lg border outline-none transition-colors"
                style={{
                  background: colors.bgPrimary,
                  borderColor: colors.borderPrimary,
                  color: colors.textPrimary,
                }}
                onFocus={e => (e.currentTarget.style.borderColor = colors.borderHover)}
                onBlur={e => (e.currentTarget.style.borderColor = colors.borderPrimary)}
              />
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto px-8 py-6">
          <div className="max-w-5xl mx-auto">
            {loadingDatasets ? (
              <div className="flex flex-col items-center justify-center py-24 gap-3">
                <div
                  className="w-8 h-8 border-2 border-t-transparent rounded-full animate-spin"
                  style={{ borderColor: colors.borderPrimary, borderTopColor: 'transparent' }}
                />
                <span className="text-sm" style={{ color: colors.textMuted }}>
                  Loading datasets...
                </span>
              </div>
            ) : filteredAndSorted.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-24 gap-4">
                <FolderOpen size={48} style={{ color: colors.textMuted }} strokeWidth={1} />
                <div className="text-center">
                  <p className="text-base font-medium" style={{ color: colors.textSecondary }}>
                    {searchQuery ? 'No matching datasets' : 'No datasets found'}
                  </p>
                  <p className="text-sm mt-1" style={{ color: colors.textMuted }}>
                    {searchQuery
                      ? 'Try a different search term.'
                      : 'Run an analysis from the Analysis tab to get started.'}
                  </p>
                </div>
              </div>
            ) : (
              <div
                className="rounded-lg border overflow-hidden"
                style={{ borderColor: colors.borderPrimary, background: colors.bgSecondary }}
              >
                {/* Table header */}
                <div
                  className="grid px-5 py-3 border-b"
                  style={{
                    gridTemplateColumns: '1fr 140px 110px 90px 32px 36px',
                    background: colors.bgTertiary,
                    borderColor: colors.borderPrimary,
                  }}
                >
                  <SortHeader label="Dataset" colKey="name" icon={<Database size={12} />} />
                  <SortHeader label="Date" colKey="date" icon={<Calendar size={12} />} />
                  <SortHeader label="Type" colKey="analysis_type" icon={<FlaskConical size={12} />} />
                  <SortHeader label="Size" colKey="size_mb" icon={<HardDrive size={12} />} />
                  <span />
                  <span />
                </div>

                {/* Rows */}
                {filteredAndSorted.map((d, idx) => (
                  <div
                    key={d.path}
                    role="button"
                    tabIndex={0}
                    onClick={() => setPathStack([d.path])}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        setPathStack([d.path]);
                      }
                    }}
                    className="w-full grid items-center px-5 py-3.5 text-left transition-colors border-b last:border-b-0 group cursor-pointer"
                    style={{
                      gridTemplateColumns: '1fr 140px 110px 90px 32px 36px',
                      background: idx % 2 === 0 ? colors.rowBg : colors.rowBgAlt,
                      borderColor: colors.rowBorder,
                    }}
                    onMouseEnter={e => (e.currentTarget.style.background = colors.rowHover)}
                    onMouseLeave={e =>
                      (e.currentTarget.style.background =
                        idx % 2 === 0 ? colors.rowBg : colors.rowBgAlt)
                    }
                  >
                    {/* Name */}
                    <div className="min-w-0">
                      <span
                        className="text-sm font-medium truncate block transition-colors"
                        style={{ color: colors.textPrimary }}
                      >
                        {d.name}
                      </span>
                      <span
                        className="text-xs truncate block mt-0.5"
                        style={{ color: colors.textMuted }}
                      >
                        {d.directory}
                      </span>
                    </div>

                    {/* Date */}
                    <span className="text-sm tabular-nums" style={{ color: colors.textSecondary }}>
                      {formatDate(d.date)}
                    </span>

                    {/* Type badge */}
                    <div>{analysisTypeBadge(d.analysis_type, colors, isDark)}</div>

                    {/* Size — h5ad only; full directory total in the tooltip */}
                    <span
                      className="text-sm tabular-nums"
                      style={{ color: colors.textMuted }}
                      title={
                        d.directory_size_mb !== undefined && d.directory_size_mb !== d.size_mb
                          ? `h5ad ${formatSize(d.size_mb)} · all analysis files ${formatSize(d.directory_size_mb)}`
                          : undefined
                      }
                    >
                      {formatSize(d.size_mb)}
                    </span>

                    {/* Arrow */}
                    <ChevronRight
                      size={16}
                      className="opacity-0 group-hover:opacity-100 transition-opacity"
                      style={{ color: colors.accentText }}
                    />

                    {/* Delete */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setConfirmDelete(d);
                      }}
                      disabled={deletingPath === d.path}
                      title="Delete dataset"
                      className="p-1 rounded opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-500/10"
                      style={{ color: colors.textMuted }}
                      onMouseEnter={(e) => (e.currentTarget.style.color = '#ef4444')}
                      onMouseLeave={(e) => (e.currentTarget.style.color = colors.textMuted)}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div
          className="shrink-0 px-8 py-3 border-t"
          style={{ background: colors.bgSecondary, borderColor: colors.borderPrimary }}
        >
          <div className="max-w-5xl mx-auto">
            <button
              onClick={onBack}
              className="flex items-center gap-1.5 text-sm transition-colors"
              style={{ color: colors.textMuted }}
              onMouseEnter={e => (e.currentTarget.style.color = colors.textPrimary)}
              onMouseLeave={e => (e.currentTarget.style.color = colors.textMuted)}
            >
              <ArrowLeft size={14} />
              Back to Analysis
            </button>
          </div>
        </div>

        {/* Delete confirmation modal */}
        {confirmDelete && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            style={{ background: 'rgba(0,0,0,0.5)' }}
            onClick={() => deletingPath === null && setConfirmDelete(null)}
          >
            <div
              className="rounded-lg border shadow-xl max-w-md w-full p-6"
              style={{ background: colors.bgSecondary, borderColor: colors.borderPrimary }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-start gap-3 mb-4">
                <div
                  className="p-2 rounded-full flex-shrink-0"
                  style={{ background: 'rgba(239,68,68,0.12)' }}
                >
                  <Trash2 size={20} style={{ color: '#ef4444' }} />
                </div>
                <div className="min-w-0">
                  <h3 className="text-base font-semibold" style={{ color: colors.textPrimary }}>
                    Delete dataset?
                  </h3>
                  <p className="text-sm mt-1" style={{ color: colors.textMuted }}>
                    This will permanently remove the entire analysis folder and all its files. This action cannot be undone.
                  </p>
                </div>
              </div>
              <div
                className="rounded border p-3 mb-4 text-xs space-y-1"
                style={{ background: colors.bgTertiary, borderColor: colors.borderPrimary }}
              >
                <div style={{ color: colors.textPrimary }}>
                  <span className="font-medium">{confirmDelete.name}</span>
                </div>
                <div className="font-mono break-all" style={{ color: colors.textMuted }}>
                  {confirmDelete.path}
                </div>
                <div style={{ color: colors.textMuted }}>
                  {formatSize(confirmDelete.directory_size_mb ?? confirmDelete.size_mb)}
                  <span className="ml-1 opacity-70">(folder total)</span>
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => setConfirmDelete(null)}
                  disabled={deletingPath !== null}
                  className="px-4 py-2 rounded text-sm font-medium border transition-colors disabled:opacity-50"
                  style={{
                    color: colors.textPrimary,
                    borderColor: colors.borderPrimary,
                    background: colors.bgTertiary,
                  }}
                >
                  Cancel
                </button>
                <button
                  onClick={() => handleDeleteDataset(confirmDelete)}
                  disabled={deletingPath !== null}
                  className="px-4 py-2 rounded text-sm font-medium text-white transition-colors disabled:opacity-50"
                  style={{ background: '#ef4444' }}
                >
                  {deletingPath === confirmDelete.path ? 'Deleting…' : 'Delete'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ── Explorer view ────────────────────────────────────────────────
  const currentDatasetInfo: DatasetInfo = {
    name: isSubcluster ? 'Subcluster View' : 'Main Dataset',
    path: currentPath,
    date: '',
    analysis_type: 'annotation',
    size_mb: 0,
    directory: '',
  };

  return (
    <div className="w-full h-full relative">
      <UMAPExplorer
        key={currentPath + refreshTrigger}
        dataset={currentDatasetInfo}
        onBack={handlePopPath}
        isSubcluster={isSubcluster}
        onOpenSubcluster={handlePushPath}
      />

      {/* Subcluster Header Overlay */}
      {isSubcluster && (
        <div
          className="absolute top-0 left-16 right-0 h-14 backdrop-blur border-b flex items-center justify-between px-6 z-30 shadow-xl"
          style={{
            background: 'rgba(88, 28, 135, 0.9)',
            borderColor: 'rgba(126, 34, 206, 0.5)',
          }}
        >
          <div className="flex items-center gap-4">
            <span className="text-purple-200 font-semibold">Subcluster Analysis View</span>
            {parentInfo?.label ? (
              <span className="text-purple-100 text-sm px-3 py-1 bg-purple-950/60 rounded border border-purple-700 flex items-center gap-2">
                <span className="text-purple-300">Parent:</span>
                <span className="font-bold">{parentInfo.label}</span>
                <ChevronRight size={14} className="text-purple-400" />
                <span className="text-purple-300">Sub-clusters</span>
              </span>
            ) : (
              <span className="text-purple-400 text-xs px-2 py-0.5 bg-purple-950/50 rounded border border-purple-800">
                Child Dataset
              </span>
            )}
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowMergeModal(true)}
              className="bg-white text-purple-900 hover:bg-gray-100 px-4 py-1.5 rounded-lg text-sm font-bold shadow-lg transition-colors flex items-center gap-2"
            >
              Merge to Parent
            </button>
            <button
              onClick={handlePopPath}
              className="text-purple-300 hover:text-white px-3 py-1.5 text-sm font-medium transition-colors"
            >
              Close View
            </button>
          </div>
        </div>
      )}

      {/* Merge Modal */}
      {isSubcluster && parentPath && (
        <MergeSubclusterModal
          isOpen={showMergeModal}
          onClose={() => setShowMergeModal(false)}
          parentPath={parentPath}
          subclusterPath={currentPath}
          onMerged={layer => {
            alert(`Successfully merged into parent layer: ${layer}`);
            setRefreshTrigger(prev => prev + 1);
          }}
        />
      )}
    </div>
  );
}
