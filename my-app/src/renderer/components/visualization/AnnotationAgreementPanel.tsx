import React, { useEffect, useMemo, useState } from 'react';
import { useVizTheme } from '../../theme/ThemeContext';
import {
  api,
  type VisualizationData,
  type AgreementSummaryEntry,
} from '../../services/api';
import CLBadge from './CLBadge';

interface AnnotationAgreementPanelProps {
  data: VisualizationData;
  /** Path to the h5ad on disk — needed to fetch the bulk LCA summary. */
  h5adPath?: string;
  /** Optional callback fired when a cluster row is clicked. Wires the panel
   *  up as a navigation surface into the cluster details popup. */
  onClusterClick?: (clusterId: string, position?: { x: number; y: number }) => void;
}

interface ClusterRow {
  clusterId: string;
  consensusLabel?: string;
  consensusConfidence?: number;
  agreementDepth?: number;
  perMethod: { method: string; cl_id: string; cl_name: string; similarity: number }[];
}

const CONSENSUS_KEY = 'consensus_annotation';
const CONFIDENCE_QC_KEY = 'consensus_annotation_confidence';
const DEPTH_QC_KEY = 'consensus_annotation_agreement_depth';

/**
 * Per-cluster annotation-method agreement panel for the bottom drawer.
 *
 * For every Leiden cluster, lists the consensus call together with each
 * backend's Cell-Ontology-mapped label and similarity score. The leftmost
 * column shows the consensus agreement fraction and (when the CL hierarchy
 * is loaded server-side) the LCA depth — together these surface "the methods
 * disagree on the leaf but agree at this level" cases that pure majority
 * voting hides.
 *
 * Empty by design when CL normalization didn't run on this dataset; the
 * panel renders a quiet "no consensus data" message in that case rather
 * than fabricating signal.
 */
export const AnnotationAgreementPanel: React.FC<AnnotationAgreementPanelProps> = ({
  data,
  h5adPath,
  onClusterClick,
}) => {
  const { v, colors } = useVizTheme();
  const [agreementByCluster, setAgreementByCluster] = useState<
    Record<string, AgreementSummaryEntry>
  >({});

  // Fetch the LCA term name per cluster in one bulk round trip. Keyed on
  // h5adPath so switching datasets refreshes; debounced via cancelled flag
  // so a quick navigation doesn't apply stale results.
  useEffect(() => {
    if (!h5adPath) return;
    let cancelled = false;
    api
      .getAgreementSummary(h5adPath)
      .then((resp) => {
        if (cancelled) return;
        setAgreementByCluster(resp.available ? resp.clusters : {});
      })
      .catch((err) => {
        // Soft-fail: panel still renders without the "Agree at" data.
        // eslint-disable-next-line no-console
        console.warn('[AgreementPanel] Failed to load agreement summary', err);
        if (!cancelled) setAgreementByCluster({});
      });
    return () => {
      cancelled = true;
    };
  }, [h5adPath]);

  const rows = useMemo<ClusterRow[]>(() => {
    const clusters = data.clusters['leiden'];
    if (!clusters) return [];

    const cellToCluster = clusters.labels;
    const consensus = data.cell_types[CONSENSUS_KEY];
    const confidenceArr = data.qc_metrics[CONFIDENCE_QC_KEY];
    const depthArr = data.qc_metrics[DEPTH_QC_KEY];
    const cl = data.cl_annotations || {};

    // Pick a representative cell index per cluster — labels are constant
    // within a cluster after consensus, so the first cell is enough.
    const repIndex: Record<string, number> = {};
    cellToCluster.forEach((cluster, idx) => {
      if (!(cluster in repIndex)) repIndex[cluster] = idx;
    });

    const out: ClusterRow[] = [];
    for (const clusterId of clusters.categories) {
      const idx = repIndex[clusterId];
      const row: ClusterRow = {
        clusterId,
        consensusLabel: consensus?.labels[idx],
        consensusConfidence: confidenceArr ? confidenceArr[idx] : undefined,
        agreementDepth: depthArr ? depthArr[idx] : undefined,
        perMethod: [],
      };
      for (const [method, byCluster] of Object.entries(cl)) {
        if (method === CONSENSUS_KEY) continue;
        const m = byCluster[clusterId];
        if (!m) continue;
        row.perMethod.push({ method, ...m });
      }
      row.perMethod.sort((a, b) => a.method.localeCompare(b.method));
      out.push(row);
    }
    out.sort((a, b) => {
      const ai = parseInt(a.clusterId, 10);
      const bi = parseInt(b.clusterId, 10);
      if (Number.isFinite(ai) && Number.isFinite(bi)) return ai - bi;
      return a.clusterId.localeCompare(b.clusterId);
    });
    return out;
  }, [data]);

  const hasAnyCL = rows.some((r) => r.perMethod.length > 0);

  if (!hasAnyCL) {
    return (
      <div className="p-6 text-sm" style={{ color: v.textMuted }}>
        No Cell-Ontology annotations on this dataset. Run the annotation
        pipeline with multiple backends and (optionally) install OmicVerse with
        <code className="mx-1" style={{ color: v.textBody }}>CellOntologyMapper</code>
        to populate per-method CL labels and the consensus agreement column.
      </div>
    );
  }

  return (
    <div className="p-4">
      <div className="text-xs mb-3" style={{ color: v.textMuted }}>
        Per-cluster consensus across annotation backends. The "Agree at" column
        names the most-specific Cell-Ontology term where every voting method
        agreed — when it's shallow ("lymphocyte" vs. a leaf), the methods
        diverged on subtype and the consensus call should be treated as a
        family-level annotation, not a final answer.
        {onClusterClick && (
          <span> Click any row to open the cluster details popup with full lineage.</span>
        )}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr style={{ color: v.textMuted }}>
              <th className="text-left py-2 pr-3 font-semibold">Cluster</th>
              <th className="text-left py-2 pr-3 font-semibold">Consensus</th>
              <th className="text-left py-2 pr-3 font-semibold">Confidence</th>
              <th className="text-left py-2 pr-3 font-semibold">Agree at</th>
              <th className="text-left py-2 pr-3 font-semibold">Per-method calls</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const agreement = agreementByCluster[row.clusterId];
              const clickable = !!onClusterClick;
              return (
                <tr
                  key={row.clusterId}
                  onClick={
                    clickable
                      ? (e) => onClusterClick!(row.clusterId, { x: e.clientX, y: e.clientY })
                      : undefined
                  }
                  className={clickable ? 'transition-colors' : undefined}
                  style={{
                    borderTop: `1px solid ${v.panelBorderSecondary}`,
                    cursor: clickable ? 'pointer' : 'default',
                  }}
                  onMouseEnter={
                    clickable
                      ? (e) => {
                          (e.currentTarget as HTMLTableRowElement).style.backgroundColor =
                            v.panelBgSecondary;
                        }
                      : undefined
                  }
                  onMouseLeave={
                    clickable
                      ? (e) => {
                          (e.currentTarget as HTMLTableRowElement).style.backgroundColor =
                            'transparent';
                        }
                      : undefined
                  }
                >
                  <td className="py-2 pr-3 font-medium" style={{ color: v.textBody }}>
                    {row.clusterId}
                  </td>
                  <td className="py-2 pr-3" style={{ color: v.textBody }}>
                    {row.consensusLabel ?? <span style={{ color: v.textFaint }}>—</span>}
                  </td>
                  <td className="py-2 pr-3 tabular-nums" style={{ color: v.textBody }}>
                    {row.consensusConfidence !== undefined ? (
                      <span
                        className="inline-block px-1.5 py-0.5 rounded"
                        style={{
                          background: confidencePalette(row.consensusConfidence, v).bg,
                          color: confidencePalette(row.consensusConfidence, v).text,
                        }}
                      >
                        {row.consensusConfidence.toFixed(2)}
                      </span>
                    ) : <span style={{ color: v.textFaint }}>—</span>}
                  </td>
                  <td className="py-2 pr-3" style={{ color: v.textBody }}>
                    {agreement ? (
                      <div className="flex flex-col leading-tight">
                        <span title={agreement.agreement_cl_id}>
                          {agreement.agreement_cl_name}
                        </span>
                        <span className="text-[10px]" style={{ color: v.textFaint }}>
                          depth {agreement.agreement_depth} · {agreement.n_methods_voting} methods
                        </span>
                      </div>
                    ) : row.agreementDepth !== undefined ? (
                      <span className="tabular-nums" style={{ color: v.textMuted }}>
                        depth {row.agreementDepth.toFixed(0)}
                      </span>
                    ) : (
                      <span style={{ color: v.textFaint }}>—</span>
                    )}
                  </td>
                  <td className="py-2 pr-3">
                    <div className="flex flex-wrap gap-1.5">
                      {row.perMethod.length === 0 && (
                        <span style={{ color: v.textFaint }}>—</span>
                      )}
                      {row.perMethod.map((m) => (
                        <div key={m.method} className="flex items-center gap-1">
                          <span style={{ color: v.textMuted }} className="text-[10px]">
                            {m.method}
                          </span>
                          <CLBadge
                            annotation={{
                              cl_id: m.cl_id,
                              cl_name: m.cl_name,
                              similarity: m.similarity,
                            }}
                          />
                        </div>
                      ))}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

function confidencePalette(c: number, v: any) {
  if (c >= 0.75) return v.badgeGreen;
  if (c >= 0.5) return v.badgeAmber;
  return v.badgeRed;
}

export default AnnotationAgreementPanel;
