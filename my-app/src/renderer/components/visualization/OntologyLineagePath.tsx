import React, { useEffect, useState } from 'react';
import { ChevronRight, GitBranch } from 'lucide-react';
import {
  api,
  ClusterLineageResponse,
  LineagePathStep,
} from '../../services/api';
import { useVizTheme } from '../../theme/ThemeContext';

interface OntologyLineagePathProps {
  h5adPath: string;
  clusterId: string;
}

/**
 * Compact breadcrumb-style visualization of the Cell-Ontology lineage from
 * the root (`cell`) down to the cluster's consensus call. At each step we
 * render the CL term plus a "k of n methods agreed at or below here" badge
 * so the user can see exactly where the methods diverge.
 *
 * Sits inside the cluster details popup. Loads lazily when the popup opens
 * for a cluster — small endpoint, single round trip per click.
 */
const OntologyLineagePath: React.FC<OntologyLineagePathProps> = ({
  h5adPath,
  clusterId,
}) => {
  const { v, isDark } = useVizTheme();
  const [data, setData] = useState<ClusterLineageResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    api
      .getClusterLineage(h5adPath, clusterId)
      .then((resp) => {
        if (cancelled) return;
        setData(resp);
        setLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Failed to load lineage');
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [h5adPath, clusterId]);

  if (loading) {
    return (
      <div className="text-xs italic" style={{ color: v.textFaint }}>
        Loading ontology lineage…
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-xs" style={{ color: v.badgeRed.text }}>
        Lineage unavailable: {error}
      </div>
    );
  }

  if (!data || !data.available || data.path.length === 0) {
    return (
      <div className="text-xs italic" style={{ color: v.textFaint }}>
        {data?.reason || 'No lineage path available for this cluster.'}
      </div>
    );
  }

  const { path, n_methods_total: n } = data;

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1.5">
        <GitBranch size={12} style={{ color: v.textFaint }} />
        <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: v.textBody }}>
          Cell-Ontology lineage
        </span>
        <span className="text-[10px]" style={{ color: v.textFaint }}>
          (root → consensus)
        </span>
      </div>

      {/* Vertical lineage — each step shows term + agreement bar. Vertical
          lays out cleanly in the narrow popup column without truncation. */}
      <div className="space-y-1">
        {path.map((step, idx) => {
          const isLast = idx === path.length - 1;
          return (
            <LineageStep
              key={`${step.cl_id}-${idx}`}
              step={step}
              total={n}
              isConsensus={isLast}
              isFirst={idx === 0}
              isDark={isDark}
              v={v}
            />
          );
        })}
      </div>

      {/* Per-method calls collapsed under the path. Each row shows the
          method's CL call and its ballot weight in the consensus vote;
          per-cell methods carry a fractional weight (= cluster plurality
          fraction) so the user can see why a confident-but-narrow plurality
          might lose to a unanimous cluster-level call. */}
      {data.method_calls.length > 0 && (
        <details className="pt-1">
          <summary
            className="text-[10px] cursor-pointer select-none"
            style={{ color: v.textFaint }}
          >
            Per-method calls ({data.method_calls.length})
          </summary>
          <div className="mt-1.5 space-y-1 pl-1">
            {data.method_calls.map((mc) => (
              <div
                key={mc.method}
                className="flex items-center justify-between text-[10px] gap-2"
              >
                <span style={{ color: v.textBody }} className="truncate">{mc.method_display}</span>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <span
                    className="px-1.5 py-[1px] rounded font-mono"
                    style={{
                      backgroundColor: v.badgeBlue.bg,
                      color: v.badgeBlue.text,
                    }}
                    title={mc.cl_id}
                  >
                    {mc.cl_name || mc.cl_id}
                  </span>
                  <span
                    className="px-1.5 py-[1px] rounded font-mono tabular-nums"
                    style={{
                      backgroundColor: mc.weight_kind === 'per-cell' ? v.badgeAmber.bg : v.panelBgSecondary,
                      color: mc.weight_kind === 'per-cell' ? v.badgeAmber.text : v.textFaint,
                    }}
                    title={
                      mc.weight_kind === 'per-cell'
                        ? `Per-cell ballot weight — ${(mc.weight * 100).toFixed(0)}% of the cluster's cells share this label at the per-cell level.`
                        : `Cluster-level method — full ballot weight.`
                    }
                  >
                    {mc.weight_kind === 'per-cell'
                      ? `w=${mc.weight.toFixed(2)}`
                      : 'w=1.0'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
};

interface LineageStepProps {
  step: LineagePathStep;
  total: number;
  isConsensus: boolean;
  isFirst: boolean;
  isDark: boolean;
  v: ReturnType<typeof useVizTheme>['v'];
}

const LineageStep: React.FC<LineageStepProps> = ({
  step,
  total,
  isConsensus,
  isFirst,
  isDark,
  v,
}) => {
  const ratio = total > 0 ? step.n_methods_at_or_below / total : 0;
  // Color shifts with agreement strength. Full agreement = green; partial =
  // amber; minority = red. Keep the consensus row visually emphasized.
  const accent = ratio >= 1
    ? v.badgeGreen
    : ratio >= 0.5
    ? v.badgeAmber
    : v.badgeRed;

  return (
    <div className="flex items-center gap-2">
      {/* Connector chevron — skipped on the root row */}
      {!isFirst ? (
        <ChevronRight size={10} style={{ color: v.textFaint, flexShrink: 0 }} />
      ) : (
        <span className="w-[10px]" />
      )}

      {/* Term name + bar */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <span
            className="text-[11px] truncate"
            style={{
              color: isConsensus ? v.textHeading : v.textLabel,
              fontWeight: isConsensus ? 600 : 400,
            }}
            title={`${step.cl_name} (${step.cl_id})`}
          >
            {step.cl_name}
          </span>
          <span
            className="text-[10px] flex-shrink-0 font-mono"
            style={{ color: accent.text }}
          >
            {step.n_methods_at_or_below}/{total}
          </span>
        </div>
        <div
          className="mt-0.5 h-1 rounded-full overflow-hidden"
          style={{ backgroundColor: v.panelBgSecondary }}
        >
          <div
            className="h-full rounded-full transition-all duration-300"
            style={{
              width: `${ratio * 100}%`,
              backgroundColor: accent.text,
              opacity: isDark ? 0.85 : 1,
            }}
          />
        </div>
      </div>
    </div>
  );
};

export default OntologyLineagePath;
