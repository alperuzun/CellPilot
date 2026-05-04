import React from 'react';
import { useVizTheme } from '../../theme/ThemeContext';
import type { CLAnnotation } from '../../services/api';

interface CLBadgeProps {
  annotation: CLAnnotation;
  /** Original free-text label the backend emitted, shown in the tooltip so the
   * user can see what string the mapper matched against. */
  rawLabel?: string;
}

/**
 * Compact pill that shows a Cell-Ontology term mapped from a backend's
 * free-text cell-type call. Color encodes similarity:
 *   * green  ≥ 0.75 — confident mapping
 *   * amber  0.50–0.75 — usable but flag for review
 *   * grey   < 0.50 — untrusted; not used in the consensus vote
 *
 * The CL ID and similarity are always available on hover via the title
 * attribute, so the visual encoding stays compact while the underlying data
 * remains inspectable.
 */
export const CLBadge: React.FC<CLBadgeProps> = ({ annotation, rawLabel }) => {
  const { v } = useVizTheme();
  const palette = paletteForSimilarity(annotation.similarity, v);
  const tooltipParts = [
    `CL: ${annotation.cl_id}`,
    `match: ${annotation.cl_name}`,
    `similarity: ${annotation.similarity.toFixed(2)}`,
  ];
  if (rawLabel && rawLabel !== annotation.cl_name) {
    tooltipParts.push(`raw: ${rawLabel}`);
  }
  return (
    <span
      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-medium tabular-nums"
      style={{
        background: palette.bg,
        color: palette.text,
        border: `1px solid ${palette.border}`,
      }}
      title={tooltipParts.join('\n')}
    >
      <span className="opacity-70">CL</span>
      <span className="truncate max-w-[120px]">{annotation.cl_name}</span>
      <span className="opacity-60">{annotation.similarity.toFixed(2)}</span>
    </span>
  );
};

interface BadgePalette {
  bg: string;
  text: string;
  border: string;
}

function paletteForSimilarity(similarity: number, v: any): BadgePalette {
  if (similarity >= 0.75) return v.badgeGreen;
  if (similarity >= 0.5) return v.badgeAmber;
  return {
    bg: v.panelBgSecondary,
    text: v.textMuted,
    border: v.panelBorderSecondary,
  };
}

export default CLBadge;
