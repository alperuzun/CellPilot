import React, { useEffect, useMemo, useRef, useState } from 'react';
import Plot from 'react-plotly.js';
import Plotly from 'plotly.js-dist-min';
import { X, Download, Loader2 } from 'lucide-react';
import { VisualizationData, GeneExpressionData } from '../../services/api';

type ExportFormat = 'png' | 'svg' | 'jpeg';
type Background = 'white' | 'transparent' | 'dark';
type Palette = 'default' | 'tab10' | 'set1' | 'dark2';

interface PublicationExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  data: VisualizationData;
  colorBy: string;
  pointSize: number;
  showGeneExpression: boolean;
  selectedGene: string;
  geneExpression: GeneExpressionData;
  customLabels?: Record<string, string>;
  datasetName: string;
}

const PALETTES: Record<Palette, string[]> = {
  default: [
    '#1f77b4', '#ff7f0e', '#2ca02c', '#d62728', '#9467bd',
    '#8c564b', '#e377c2', '#7f7f7f', '#bcbd22', '#17becf',
    '#aec7e8', '#ffbb78', '#98df8a', '#ff9896', '#c5b0d5',
    '#c49c94', '#f7b6d3', '#c7c7c7', '#dbdb8d', '#9edae5',
    '#ad494a', '#8c6239', '#843c39', '#7b4173', '#a55194',
    '#ce6dbd', '#de9ed6', '#3182bd', '#6baed6', '#9ecae1',
  ],
  tab10: [
    '#4e79a7', '#f28e2b', '#e15759', '#76b7b2', '#59a14f',
    '#edc948', '#b07aa1', '#ff9da7', '#9c755f', '#bab0ac',
  ],
  set1: [
    '#e41a1c', '#377eb8', '#4daf4a', '#984ea3', '#ff7f00',
    '#ffff33', '#a65628', '#f781bf', '#999999',
  ],
  dark2: [
    '#1b9e77', '#d95f02', '#7570b3', '#e7298a', '#66a61e',
    '#e6ab02', '#a6761d', '#666666',
  ],
};

const GENE_COLORSCALE: [number, string][] = [
  [0, '#f0f0f0'], [0.1, '#dbe9f6'], [0.25, '#9ecae1'],
  [0.4, '#4292c6'], [0.55, '#2171b5'], [0.7, '#08519c'],
  [0.85, '#bd1717'], [1, '#67000d'],
];

export const PublicationExportModal: React.FC<PublicationExportModalProps> = ({
  isOpen,
  onClose,
  data,
  colorBy,
  pointSize: initialPointSize,
  showGeneExpression,
  selectedGene,
  geneExpression,
  customLabels,
  datasetName,
}) => {
  const plotRef = useRef<any>(null);

  const [title, setTitle] = useState<string>('');
  const [subtitle, setSubtitle] = useState<string>('');
  const [format, setFormat] = useState<ExportFormat>('png');
  const [scale, setScale] = useState<number>(3);
  const [width, setWidth] = useState<number>(1400);
  const [height, setHeight] = useState<number>(1000);
  const [pointSize, setPointSize] = useState<number>(Math.max(3, Math.min(initialPointSize, 6)));
  const [showLegend, setShowLegend] = useState<boolean>(true);
  const [showClusterLabels, setShowClusterLabels] = useState<boolean>(true);
  const [showAxisArrows, setShowAxisArrows] = useState<boolean>(true);
  const [background, setBackground] = useState<Background>('white');
  const [palette, setPalette] = useState<Palette>('default');
  const [filename, setFilename] = useState<string>('');
  const [exporting, setExporting] = useState<boolean>(false);

  useEffect(() => {
    if (isOpen) {
      const safe = (datasetName || 'figure').replace(/[^a-z0-9_-]+/gi, '_');
      const tag = showGeneExpression && selectedGene ? selectedGene : colorBy;
      setFilename(`${safe}_${tag}_umap`);
      setTitle((prev) => prev || `${datasetName}`);
      setSubtitle((prev) => prev || `n = ${data.cell_ids.length.toLocaleString()} cells`);
    }
  }, [isOpen, datasetName, colorBy, selectedGene, showGeneExpression, data.cell_ids.length]);

  // ── Resolve embedding ─────────────────────────────────────────────
  const availableEmbeddings = data.summary_stats?.embeddings_available || [];
  const embeddingKey =
    availableEmbeddings.includes('umap') ? 'umap' : availableEmbeddings[0] || 'umap';
  const coords = data.embeddings?.[embeddingKey];
  const embeddingDisplayName = embeddingKey.toUpperCase();

  // ── Resolve color mapping ─────────────────────────────────────────
  const colorInfo = useMemo(() => {
    if (showGeneExpression && selectedGene && geneExpression[selectedGene]) {
      return {
        type: 'continuous' as const,
        values: geneExpression[selectedGene] as number[],
        legendTitle: selectedGene,
      };
    }
    const applyLabels = (vals: string[], cats: string[]) => {
      if (!customLabels || !Object.keys(customLabels).length) return { values: vals, categories: cats };
      const newValues = vals.map((v) => customLabels[v] || v);
      const seen = new Set<string>();
      const newCats: string[] = [];
      cats.forEach((c) => {
        const m = customLabels[c] || c;
        if (!seen.has(m)) { seen.add(m); newCats.push(m); }
      });
      return { values: newValues, categories: newCats };
    };

    if (data.clusters[colorBy]) {
      const { values, categories } = applyLabels(
        data.clusters[colorBy].labels,
        data.clusters[colorBy].categories
      );
      return { type: 'categorical' as const, values, categories, legendTitle: colorBy };
    }
    if (data.cell_types[colorBy]) {
      const { values, categories } = applyLabels(
        data.cell_types[colorBy].labels,
        data.cell_types[colorBy].categories
      );
      return { type: 'categorical' as const, values, categories, legendTitle: colorBy };
    }
    if (data.qc_metrics[colorBy]) {
      return {
        type: 'continuous' as const,
        values: data.qc_metrics[colorBy] as number[],
        legendTitle: colorBy,
      };
    }
    return { type: 'categorical' as const, values: [] as string[], categories: [] as string[], legendTitle: colorBy };
  }, [data, colorBy, showGeneExpression, selectedGene, geneExpression, customLabels]);

  // ── Theme ─────────────────────────────────────────────────────────
  const isDark = background === 'dark';
  const paperBg = background === 'transparent' ? 'rgba(0,0,0,0)' : isDark ? '#0f1115' : '#ffffff';
  const plotBg = paperBg;
  const ink = isDark ? '#f5f5f7' : '#111111';
  const inkSoft = isDark ? '#bdbdc7' : '#444444';
  const axisColor = isDark ? '#9ca3af' : '#1f1f1f';

  // ── Build traces ──────────────────────────────────────────────────
  const traces = useMemo(() => {
    if (!coords) return [] as any[];

    if (colorInfo.type === 'continuous') {
      const vals = colorInfo.values as number[];
      return [
        {
          x: coords.x,
          y: coords.y,
          mode: 'markers',
          type: 'scattergl',
          marker: {
            size: pointSize,
            color: vals,
            colorscale: GENE_COLORSCALE as any,
            showscale: showLegend,
            colorbar: showLegend
              ? {
                  title: { text: colorInfo.legendTitle, font: { size: 13, color: ink } },
                  thickness: 14,
                  len: 0.55,
                  outlinewidth: 0,
                  tickfont: { size: 11, color: inkSoft },
                  x: 1.01,
                  xanchor: 'left' as const,
                  y: 0.5,
                  yanchor: 'middle' as const,
                }
              : undefined,
            line: { width: 0 },
          },
          hoverinfo: 'skip',
          showlegend: false,
        },
      ];
    }

    // categorical: one trace per category for a clean legend
    const categories = (colorInfo as any).categories as string[];
    const valueArr = (colorInfo as any).values as string[];
    const palColors = PALETTES[palette];
    const catToColor: Record<string, string> = {};
    categories.forEach((c, i) => { catToColor[c] = palColors[i % palColors.length]; });

    const grouped: Record<string, { x: number[]; y: number[] }> = {};
    categories.forEach((c) => { grouped[c] = { x: [], y: [] }; });
    valueArr.forEach((v, i) => {
      if (!grouped[v]) grouped[v] = { x: [], y: [] };
      grouped[v].x.push(coords.x[i]);
      grouped[v].y.push(coords.y[i]);
    });

    return categories.map((cat) => ({
      x: grouped[cat].x,
      y: grouped[cat].y,
      mode: 'markers',
      type: 'scattergl',
      name: cat,
      marker: {
        size: pointSize,
        color: catToColor[cat],
        line: { width: 0 },
      },
      hoverinfo: 'skip',
      showlegend: showLegend,
    }));
  }, [coords, colorInfo, pointSize, showLegend, palette, ink, inkSoft]);

  // ── Centroid annotations for categorical ──────────────────────────
  const centroidAnnotations = useMemo(() => {
    if (!coords) return [] as any[];
    if (colorInfo.type !== 'categorical' || !showClusterLabels) return [] as any[];
    const categories = (colorInfo as any).categories as string[];
    const valueArr = (colorInfo as any).values as string[];

    const sums: Record<string, { x: number; y: number; n: number }> = {};
    categories.forEach((c) => { sums[c] = { x: 0, y: 0, n: 0 }; });
    valueArr.forEach((v, i) => {
      const s = sums[v];
      if (!s) return;
      s.x += coords.x[i];
      s.y += coords.y[i];
      s.n += 1;
    });

    return categories
      .filter((c) => sums[c] && sums[c].n > 0)
      .map((c) => ({
        x: sums[c].x / sums[c].n,
        y: sums[c].y / sums[c].n,
        text: `<b>${c}</b>`,
        showarrow: false,
        font: { size: 13, color: ink, family: 'Inter, system-ui, sans-serif' },
        bgcolor: isDark ? 'rgba(15,17,21,0.78)' : 'rgba(255,255,255,0.82)',
        bordercolor: isDark ? '#2b2f36' : '#d4d4d8',
        borderwidth: 1,
        borderpad: 3,
      }));
  }, [coords, colorInfo, showClusterLabels, ink, isDark]);

  // ── Axis arrows in bottom-left (publication style) ────────────────
  const axisShapes = useMemo(() => {
    if (!coords || !showAxisArrows) return { shapes: [] as any[], annotations: [] as any[] };
    const xs = coords.x, ys = coords.y;
    const xMin = Math.min(...xs), xMax = Math.max(...xs);
    const yMin = Math.min(...ys), yMax = Math.max(...ys);
    const xRange = xMax - xMin, yRange = yMax - yMin;
    const ax = xMin - xRange * 0.05;
    const ay = yMin - yRange * 0.05;
    const lenX = xRange * 0.18;
    const lenY = yRange * 0.18;

    const arrowColor = axisColor;
    const shapes = [
      {
        type: 'line', x0: ax, y0: ay, x1: ax + lenX, y1: ay,
        line: { color: arrowColor, width: 2 },
      },
      {
        type: 'line', x0: ax, y0: ay, x1: ax, y1: ay + lenY,
        line: { color: arrowColor, width: 2 },
      },
    ];
    const annotations = [
      {
        x: ax + lenX, y: ay,
        ax: ax + lenX * 0.001, ay: ay,
        xref: 'x', yref: 'y', axref: 'x', ayref: 'y',
        showarrow: true, arrowhead: 2, arrowsize: 1.4, arrowwidth: 2,
        arrowcolor: arrowColor, text: '',
      },
      {
        x: ax, y: ay + lenY,
        ax: ax, ay: ay + lenY * 0.001,
        xref: 'x', yref: 'y', axref: 'x', ayref: 'y',
        showarrow: true, arrowhead: 2, arrowsize: 1.4, arrowwidth: 2,
        arrowcolor: arrowColor, text: '',
      },
      {
        x: ax + lenX / 2, y: ay - yRange * 0.025,
        text: `${embeddingDisplayName}1`,
        showarrow: false,
        font: { size: 12, color: arrowColor, family: 'Inter, system-ui, sans-serif' },
        xanchor: 'center', yanchor: 'top',
      },
      {
        x: ax - xRange * 0.025, y: ay + lenY / 2,
        text: `${embeddingDisplayName}2`,
        showarrow: false,
        font: { size: 12, color: arrowColor, family: 'Inter, system-ui, sans-serif' },
        textangle: -90,
        xanchor: 'right', yanchor: 'middle',
      },
    ];
    return { shapes, annotations };
  }, [coords, showAxisArrows, axisColor, embeddingDisplayName]);

  // ── Layout ────────────────────────────────────────────────────────
  const layout = useMemo(() => {
    const subtitleY = title ? 0.945 : 0.97;
    return {
      width,
      height,
      paper_bgcolor: paperBg,
      plot_bgcolor: plotBg,
      margin: {
        l: 50,
        r: showLegend && colorInfo.type === 'categorical' ? 220 : showLegend ? 110 : 40,
        t: title ? 90 : subtitle ? 60 : 30,
        b: 50,
      },
      title: title
        ? {
            text: subtitle
              ? `<b>${title}</b><br><span style="font-size:13px;color:${inkSoft}">${subtitle}</span>`
              : `<b>${title}</b>`,
            font: { size: 20, color: ink, family: 'Inter, system-ui, sans-serif' },
            x: 0.02,
            xanchor: 'left' as const,
            y: 0.97,
            yanchor: 'top' as const,
          }
        : subtitle
        ? {
            text: `<span style="color:${inkSoft}">${subtitle}</span>`,
            font: { size: 13, family: 'Inter, system-ui, sans-serif' },
            x: 0.02,
            xanchor: 'left' as const,
            y: subtitleY,
            yanchor: 'top' as const,
          }
        : undefined,
      xaxis: {
        showgrid: false,
        zeroline: false,
        showticklabels: false,
        showline: false,
        ticks: '',
      },
      yaxis: {
        showgrid: false,
        zeroline: false,
        showticklabels: false,
        showline: false,
        ticks: '',
        scaleanchor: 'x' as any,
        scaleratio: 1,
      },
      shapes: axisShapes.shapes,
      annotations: [...axisShapes.annotations, ...centroidAnnotations],
      legend: showLegend && colorInfo.type === 'categorical'
        ? {
            x: 1.01,
            xanchor: 'left' as const,
            y: 0.5,
            yanchor: 'middle' as const,
            bgcolor: 'rgba(0,0,0,0)',
            bordercolor: 'rgba(0,0,0,0)',
            font: { size: 12, color: ink, family: 'Inter, system-ui, sans-serif' },
            title: {
              text: `<b>${colorInfo.legendTitle}</b>`,
              font: { size: 13, color: ink },
              side: 'top' as const,
            },
            itemsizing: 'constant' as const,
            itemwidth: 30,
            tracegroupgap: 2,
          }
        : undefined,
      hovermode: false as const,
      showlegend: showLegend && colorInfo.type === 'categorical',
    };
  }, [
    width, height, paperBg, plotBg, ink, inkSoft,
    title, subtitle, showLegend, colorInfo,
    axisShapes, centroidAnnotations,
  ]);

  // ── Export handler ────────────────────────────────────────────────
  const handleDownload = async () => {
    const gd = plotRef.current?.el || plotRef.current;
    if (!gd) return;
    setExporting(true);
    try {
      const dataUrl = await Plotly.toImage(gd, {
        format,
        width,
        height,
        scale: format === 'svg' ? 1 : scale,
      });
      const a = document.createElement('a');
      a.href = dataUrl;
      a.download = `${filename || 'figure'}.${format}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch (e) {
      console.error('Export failed', e);
    } finally {
      setExporting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black bg-opacity-60 backdrop-blur-sm">
      <div className="bg-neutral-900 text-gray-100 border border-neutral-800 rounded-lg shadow-2xl w-full max-w-[1400px] h-[92vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-neutral-800">
          <div>
            <h3 className="text-base font-semibold text-white">Export publication figure</h3>
            <p className="text-xs text-neutral-400 mt-0.5">
              Configure your figure and download a high-resolution image suitable for papers and slides.
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-md text-neutral-400 hover:text-white hover:bg-neutral-800 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Body: preview + controls */}
        <div className="flex-1 flex overflow-hidden">
          {/* Preview */}
          <div className="flex-1 flex items-center justify-center overflow-auto p-6"
               style={{
                 background: isDark ? '#1a1c21' : '#f4f4f5',
                 backgroundImage: background === 'transparent'
                   ? 'linear-gradient(45deg, #2a2a2e 25%, transparent 25%), linear-gradient(-45deg, #2a2a2e 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #2a2a2e 75%), linear-gradient(-45deg, transparent 75%, #2a2a2e 75%)'
                   : undefined,
                 backgroundSize: background === 'transparent' ? '20px 20px' : undefined,
                 backgroundPosition: background === 'transparent' ? '0 0, 0 10px, 10px -10px, -10px 0px' : undefined,
               }}
          >
            <div
              className="shadow-2xl"
              style={{
                background: paperBg,
                width: Math.min(width, 1100),
                aspectRatio: `${width} / ${height}`,
                maxHeight: '100%',
              }}
            >
              <Plot
                ref={plotRef as any}
                data={traces as any}
                layout={layout as any}
                config={{ displayModeBar: false, responsive: true, staticPlot: true }}
                style={{ width: '100%', height: '100%' }}
                useResizeHandler
              />
            </div>
          </div>

          {/* Controls */}
          <div className="w-[340px] border-l border-neutral-800 overflow-y-auto custom-scrollbar p-4 space-y-5 bg-neutral-950/40">
            <Section title="Title & caption">
              <Field label="Title">
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Figure title"
                  className="w-full bg-neutral-900 border border-neutral-700 rounded px-2.5 py-1.5 text-sm text-white placeholder-neutral-500 focus:outline-none focus:border-blue-500"
                />
              </Field>
              <Field label="Caption">
                <input
                  type="text"
                  value={subtitle}
                  onChange={(e) => setSubtitle(e.target.value)}
                  placeholder="e.g. n = 12,345 cells"
                  className="w-full bg-neutral-900 border border-neutral-700 rounded px-2.5 py-1.5 text-sm text-white placeholder-neutral-500 focus:outline-none focus:border-blue-500"
                />
              </Field>
            </Section>

            <Section title="Layout">
              <ToggleRow
                label="Show legend"
                value={showLegend}
                onChange={setShowLegend}
              />
              <ToggleRow
                label="Label clusters on plot"
                value={showClusterLabels}
                onChange={setShowClusterLabels}
                disabled={colorInfo.type !== 'categorical'}
                hint={colorInfo.type !== 'categorical' ? 'Categorical only' : undefined}
              />
              <ToggleRow
                label={`Show ${embeddingDisplayName} axis arrows`}
                value={showAxisArrows}
                onChange={setShowAxisArrows}
              />
              <Field label="Background">
                <div className="grid grid-cols-3 gap-1.5">
                  {(['white', 'transparent', 'dark'] as Background[]).map((b) => (
                    <button
                      key={b}
                      onClick={() => setBackground(b)}
                      className={`text-xs py-1.5 rounded border transition-colors capitalize ${
                        background === b
                          ? 'bg-blue-600 border-blue-500 text-white'
                          : 'bg-neutral-900 border-neutral-700 text-neutral-300 hover:border-neutral-500'
                      }`}
                    >
                      {b}
                    </button>
                  ))}
                </div>
              </Field>
            </Section>

            <Section title="Style">
              <Field label="Color palette" hint={colorInfo.type !== 'categorical' ? '(continuous: gradient)' : ''}>
                <select
                  disabled={colorInfo.type !== 'categorical'}
                  value={palette}
                  onChange={(e) => setPalette(e.target.value as Palette)}
                  className="w-full bg-neutral-900 border border-neutral-700 rounded px-2.5 py-1.5 text-sm text-white disabled:opacity-50 focus:outline-none focus:border-blue-500"
                >
                  <option value="default">Default (D3)</option>
                  <option value="tab10">Tableau 10</option>
                  <option value="set1">ColorBrewer Set1</option>
                  <option value="dark2">ColorBrewer Dark2</option>
                </select>
              </Field>
              <SliderRow
                label="Point size"
                value={pointSize}
                onChange={setPointSize}
                min={1}
                max={12}
                step={1}
              />
            </Section>

            <Section title="Output">
              <Field label="Filename">
                <div className="flex items-center gap-1">
                  <input
                    type="text"
                    value={filename}
                    onChange={(e) => setFilename(e.target.value)}
                    className="flex-1 bg-neutral-900 border border-neutral-700 rounded px-2.5 py-1.5 text-sm text-white focus:outline-none focus:border-blue-500"
                  />
                  <span className="text-xs text-neutral-500">.{format}</span>
                </div>
              </Field>
              <Field label="Format">
                <div className="grid grid-cols-3 gap-1.5">
                  {(['png', 'svg', 'jpeg'] as ExportFormat[]).map((f) => (
                    <button
                      key={f}
                      onClick={() => setFormat(f)}
                      className={`text-xs py-1.5 rounded border transition-colors uppercase ${
                        format === f
                          ? 'bg-blue-600 border-blue-500 text-white'
                          : 'bg-neutral-900 border-neutral-700 text-neutral-300 hover:border-neutral-500'
                      }`}
                    >
                      {f}
                    </button>
                  ))}
                </div>
              </Field>
              <div className="grid grid-cols-2 gap-2">
                <Field label="Width (px)">
                  <input
                    type="number"
                    value={width}
                    onChange={(e) => setWidth(Math.max(400, Math.min(6000, Number(e.target.value) || 0)))}
                    className="w-full bg-neutral-900 border border-neutral-700 rounded px-2.5 py-1.5 text-sm text-white focus:outline-none focus:border-blue-500"
                  />
                </Field>
                <Field label="Height (px)">
                  <input
                    type="number"
                    value={height}
                    onChange={(e) => setHeight(Math.max(400, Math.min(6000, Number(e.target.value) || 0)))}
                    className="w-full bg-neutral-900 border border-neutral-700 rounded px-2.5 py-1.5 text-sm text-white focus:outline-none focus:border-blue-500"
                  />
                </Field>
              </div>
              {format !== 'svg' && (
                <Field label={`Resolution scale (${scale}× ≈ ${Math.round(width * scale)}×${Math.round(height * scale)} px)`}>
                  <div className="grid grid-cols-4 gap-1.5">
                    {[1, 2, 3, 4].map((s) => (
                      <button
                        key={s}
                        onClick={() => setScale(s)}
                        className={`text-xs py-1.5 rounded border transition-colors ${
                          scale === s
                            ? 'bg-blue-600 border-blue-500 text-white'
                            : 'bg-neutral-900 border-neutral-700 text-neutral-300 hover:border-neutral-500'
                        }`}
                      >
                        {s}×
                      </button>
                    ))}
                  </div>
                </Field>
              )}
            </Section>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-3 border-t border-neutral-800 bg-neutral-950/60">
          <div className="text-xs text-neutral-500">
            {format === 'svg'
              ? 'SVG: vector — infinitely scalable, ideal for journals.'
              : `${format.toUpperCase()}: ${Math.round(width * scale)}×${Math.round(height * scale)} px @ ${scale}× DPI`}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-3.5 py-1.5 text-sm text-neutral-300 hover:text-white hover:bg-neutral-800 rounded transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleDownload}
              disabled={exporting}
              className="px-4 py-1.5 text-sm font-medium bg-blue-600 hover:bg-blue-500 disabled:opacity-60 text-white rounded transition-colors flex items-center gap-2"
            >
              {exporting ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
              {exporting ? 'Rendering…' : `Download ${format.toUpperCase()}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// ── Small UI helpers ─────────────────────────────────────────────────
const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <div>
    <div className="text-[10px] font-semibold uppercase tracking-wider text-neutral-500 mb-2">{title}</div>
    <div className="space-y-2.5">{children}</div>
  </div>
);

const Field: React.FC<{ label: string; hint?: string; children: React.ReactNode }> = ({ label, hint, children }) => (
  <div>
    <div className="flex items-center justify-between mb-1">
      <label className="text-xs text-neutral-300">{label}</label>
      {hint && <span className="text-[10px] text-neutral-500">{hint}</span>}
    </div>
    {children}
  </div>
);

const ToggleRow: React.FC<{
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  hint?: string;
}> = ({ label, value, onChange, disabled, hint }) => (
  <div className={`flex items-center justify-between ${disabled ? 'opacity-50' : ''}`}>
    <div className="flex flex-col">
      <span className="text-xs text-neutral-300">{label}</span>
      {hint && <span className="text-[10px] text-neutral-500">{hint}</span>}
    </div>
    <button
      type="button"
      disabled={disabled}
      onClick={() => onChange(!value)}
      className={`relative w-9 h-5 rounded-full transition-colors ${
        value ? 'bg-blue-600' : 'bg-neutral-700'
      } ${disabled ? 'cursor-not-allowed' : 'cursor-pointer'}`}
    >
      <span
        className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full transition-transform ${
          value ? 'translate-x-4' : 'translate-x-0'
        }`}
      />
    </button>
  </div>
);

const SliderRow: React.FC<{
  label: string;
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step?: number;
}> = ({ label, value, onChange, min, max, step = 1 }) => (
  <div>
    <div className="flex items-center justify-between mb-1">
      <span className="text-xs text-neutral-300">{label}</span>
      <span className="text-xs tabular-nums text-neutral-400">{value}</span>
    </div>
    <input
      type="range"
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      className="w-full accent-blue-500"
    />
  </div>
);

export default PublicationExportModal;
