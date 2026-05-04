import React, { useEffect, useMemo, useRef, useState } from 'react';
import { BookOpen, Camera } from 'lucide-react';
import { useTheme } from '../theme/ThemeContext';

// ---------------------------------------------------------------------------
// Section metadata: id used both as anchor and as TOC link target.
// ---------------------------------------------------------------------------
interface SectionDef {
  id: string;
  label: string;
}

const SECTIONS: SectionDef[] = [
  { id: 'getting-started', label: 'Getting Started' },
  { id: 'analysis-wizard', label: 'Analysis Wizard' },
  { id: 'visualization-dashboard', label: 'Visualization Dashboard' },
  { id: 'ai-assistant', label: 'AI Bioinformatics Assistant' },
  { id: 'settings', label: 'Settings' },
  { id: 'tips-troubleshooting', label: 'Tips & Troubleshooting' },
];

// ---------------------------------------------------------------------------
// ScreenshotSlot: drop-in placeholder. Pass `src` later to swap in an image.
// ---------------------------------------------------------------------------
interface ScreenshotSlotProps {
  caption: string;
  src?: string;
  alt?: string;
  aspect?: string; // CSS aspect-ratio, e.g. "16 / 9"
}

function ScreenshotSlot({ caption, src, alt, aspect = '16 / 9' }: ScreenshotSlotProps) {
  const { colors } = useTheme();
  if (src) {
    return (
      <figure className="my-5">
        <img
          src={src}
          alt={alt ?? caption}
          className="w-full rounded-lg"
          style={{ border: `1px solid ${colors.borderPrimary}` }}
        />
        <figcaption
          className="mt-2 text-xs italic"
          style={{ color: colors.textMuted }}
        >
          {caption}
        </figcaption>
      </figure>
    );
  }
  return (
    <div
      className="my-5 rounded-lg flex flex-col items-center justify-center text-center px-6 py-10"
      style={{
        border: `2px dashed ${colors.borderPrimary}`,
        background: colors.bgTertiary,
        aspectRatio: aspect,
      }}
    >
      <Camera size={32} style={{ color: colors.textMuted }} className="mb-3" />
      <div
        className="text-sm font-semibold mb-1"
        style={{ color: colors.textSecondary }}
      >
        Screenshot placeholder
      </div>
      <div className="text-xs" style={{ color: colors.textMuted }}>
        {caption}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// SectionHeader: anchor-targetable header.
// ---------------------------------------------------------------------------
function SectionHeader({ id, children }: { id: string; children: React.ReactNode }) {
  const { colors } = useTheme();
  return (
    <h2
      id={id}
      className="text-2xl font-bold mt-10 mb-3 scroll-mt-24"
      style={{ color: colors.textPrimary }}
    >
      {children}
    </h2>
  );
}

function SubHeader({ children }: { children: React.ReactNode }) {
  const { colors } = useTheme();
  return (
    <h3
      className="text-lg font-semibold mt-6 mb-2"
      style={{ color: colors.textPrimary }}
    >
      {children}
    </h3>
  );
}

function P({ children }: { children: React.ReactNode }) {
  const { colors } = useTheme();
  return (
    <p className="text-sm leading-relaxed mb-3" style={{ color: colors.textSecondary }}>
      {children}
    </p>
  );
}

function Code({ children }: { children: React.ReactNode }) {
  const { colors } = useTheme();
  return (
    <code
      className="px-1.5 py-0.5 rounded text-[12px] font-mono"
      style={{ background: colors.bgTertiary, color: colors.textPrimary }}
    >
      {children}
    </code>
  );
}

function CodeBlock({ children }: { children: string }) {
  const { colors } = useTheme();
  return (
    <pre
      className="rounded-md text-xs font-mono px-4 py-3 overflow-x-auto my-3"
      style={{
        background: colors.bgTertiary,
        color: colors.textPrimary,
        border: `1px solid ${colors.borderPrimary}`,
      }}
    >
      {children}
    </pre>
  );
}

function Bullets({ items }: { items: React.ReactNode[] }) {
  const { colors } = useTheme();
  return (
    <ul className="list-disc pl-6 mb-3 space-y-1.5">
      {items.map((item, i) => (
        <li key={i} className="text-sm leading-relaxed" style={{ color: colors.textSecondary }}>
          {item}
        </li>
      ))}
    </ul>
  );
}

// ---------------------------------------------------------------------------
// Documentation page
// ---------------------------------------------------------------------------
export default function Documentation() {
  const { colors } = useTheme();
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [activeId, setActiveId] = useState<string>(SECTIONS[0].id);

  // Track which section is currently in view to highlight the TOC entry.
  useEffect(() => {
    const root = scrollRef.current;
    if (!root) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio);
        if (visible.length > 0) {
          setActiveId(visible[0].target.id);
        }
      },
      { root, rootMargin: '-30% 0px -60% 0px', threshold: [0, 0.25, 0.5, 1] },
    );
    SECTIONS.forEach((s) => {
      const el = root.querySelector(`#${s.id}`);
      if (el) observer.observe(el);
    });
    return () => observer.disconnect();
  }, []);

  const handleJump = (id: string) => {
    const root = scrollRef.current;
    if (!root) return;
    const el = root.querySelector(`#${id}`) as HTMLElement | null;
    if (el) {
      root.scrollTo({ top: el.offsetTop - 24, behavior: 'smooth' });
    }
  };

  const tocStyles = useMemo(
    () => ({
      bg: colors.bgSecondary,
      border: colors.borderPrimary,
      activeBg: colors.accentSubtle,
      activeText: colors.accentText,
      idleText: colors.textSecondary,
      hoverBg: colors.bgHover,
    }),
    [colors],
  );

  return (
    <div
      ref={scrollRef}
      className="h-full overflow-auto"
      style={{ background: colors.bgPrimary }}
    >
      <div className="flex max-w-6xl mx-auto px-6 py-8 gap-8">
        {/* Sticky table of contents */}
        <aside className="hidden md:block w-56 shrink-0">
          <div
            className="sticky top-4 rounded-lg p-3"
            style={{ background: tocStyles.bg, border: `1px solid ${tocStyles.border}` }}
          >
            <div
              className="text-xs font-semibold uppercase tracking-wider mb-2 px-2"
              style={{ color: colors.textMuted }}
            >
              Contents
            </div>
            <nav className="flex flex-col">
              {SECTIONS.map((s) => {
                const isActive = activeId === s.id;
                return (
                  <button
                    key={s.id}
                    onClick={() => handleJump(s.id)}
                    className="text-left text-xs py-1.5 px-2 rounded transition-colors"
                    style={{
                      background: isActive ? tocStyles.activeBg : 'transparent',
                      color: isActive ? tocStyles.activeText : tocStyles.idleText,
                      fontWeight: isActive ? 600 : 400,
                    }}
                    onMouseEnter={(e) => {
                      if (!isActive) e.currentTarget.style.background = tocStyles.hoverBg;
                    }}
                    onMouseLeave={(e) => {
                      if (!isActive) e.currentTarget.style.background = 'transparent';
                    }}
                  >
                    {s.label}
                  </button>
                );
              })}
            </nav>
          </div>
        </aside>

        {/* Content */}
        <article className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <BookOpen size={20} style={{ color: colors.textPrimary }} />
            <h1 className="text-3xl font-bold" style={{ color: colors.textPrimary }}>
              Documentation
            </h1>
          </div>
          <p className="text-sm mb-6" style={{ color: colors.textSecondary }}>
            A guided tour of CellPilot — installation, the analysis wizard, the
            visualization dashboard, the AI assistant, and tips for everyday use.
          </p>

          {/* ============ Getting Started ============ */}
          <SectionHeader id="getting-started">Getting Started</SectionHeader>
          <P>
            CellPilot is a desktop application for end-to-end single-cell RNA-seq
            analysis. It bundles cell-type annotation across multiple
            complementary backends (with a consensus across them), interactive
            UMAP exploration, on-the-fly differential expression, subclustering,
            an AI bioinformatics assistant, and publication-quality figure
            export — all in one place.
          </P>

          <SubHeader>Launching the app</SubHeader>
          <P>
            From the project root, the launch script starts both the FastAPI
            backend and the Electron frontend together.
          </P>
          <CodeBlock>{`# from the SingleCell repo root
chmod +x launch_cellpilot.sh
./launch_cellpilot.sh`}</CodeBlock>
          <P>
            If you prefer to run the two halves separately during development,
            start the backend with <Code>uvicorn app.main:app --reload</Code> from
            the <Code>backend/</Code> directory and the frontend with{' '}
            <Code>npm start</Code> from <Code>my-app/</Code>.
          </P>

          <SubHeader>First-time setup: API keys</SubHeader>
          <P>
            The AI bioinformatics assistant calls a hosted LLM provider. Open the{' '}
            <strong>SETTINGS</strong> tab in the sidebar and add a key for either
            OpenAI or Anthropic (or both — you can switch between them inside the
            chat panel). Keys are written to <Code>backend/.env</Code> on this
            machine and never leave it.
          </P>
          <ScreenshotSlot caption="Settings page with the LLM Providers panel — empty state, ready to receive an API key" />

          {/* ============ Analysis Wizard ============ */}
          <SectionHeader id="analysis-wizard">Analysis Wizard</SectionHeader>
          <P>
            The wizard walks a dataset from raw counts to a fully annotated
            object, with optional consensus across multiple annotation backends.
            Open the <strong>ANALYSIS</strong> tab to start.
          </P>

          <SubHeader>Step 1 — Upload &amp; Define</SubHeader>
          <Bullets
            items={[
              <>
                Supported file formats: <Code>.h5ad</Code> (AnnData) and{' '}
                <Code>.h5</Code> output from 10x Cell Ranger.
              </>,
              <>
                Toggle <strong>“Already preprocessed”</strong> if your file
                already contains normalized counts, HVGs, PCA, and a UMAP — the
                wizard will skip preprocessing and re-use what is there.
              </>,
              <>
                Large files (500 MB+) load lazily; the validation pass reads only
                the AnnData index, so the upload feels instant.
              </>,
            ]}
          />
          <ScreenshotSlot caption="Step 1 of the wizard: file picker, dataset name field, and the 'already preprocessed' toggle" />

          <SubHeader>Step 2 / 3 — Configure &amp; Launch</SubHeader>
          <P>
            Configure preprocessing, clustering, and the annotation backends
            you want to run. CellPilot will execute every selected backend and
            compute a per-cluster majority-vote consensus across them.
          </P>
          <Bullets
            items={[
              <>
                <strong>Quality control</strong> — set min genes/counts, max
                mitochondrial percentage, doublet removal.
              </>,
              <>
                <strong>Clustering</strong> — set HVG count, PCA components, kNN
                size, primary Leiden resolution, and optionally enable a
                multi-resolution panel.
              </>,
              <>
                <strong>Annotation backends</strong> — pick any subset; CellPilot
                will run them all and compute a consensus:
                <ul className="list-disc pl-6 mt-1.5 space-y-1">
                  <li>
                    <strong>CellMarker / PanglaoDB / Cancer Single Cell Atlas</strong>{' '}
                    — marker-database scoring via OmicVerse pySCSA
                  </li>
                  <li>
                    <strong>CellTypist</strong> — pretrained logistic-regression
                    atlas classifiers; one or more models
                  </li>
                  <li>
                    <strong>PopV</strong> — eight-classifier ensemble with
                    per-cell agreement scores; pretrained Tabula Sapiens
                    reference or your own annotated <Code>.h5ad</Code>
                  </li>
                  <li>
                    <strong>mLLMCelltype</strong> — single-model or multi-model
                    LLM consensus across OpenAI / Anthropic / Gemini / OpenRouter
                  </li>
                  <li>
                    <strong>Manual markers</strong> — CSV or free-text marker
                    list; scored per cell
                  </li>
                </ul>
              </>,
            ]}
          />
          <ScreenshotSlot caption="Configure & Launch step showing the QC, clustering, and annotation backends selection" />
          <P>
            Hit <strong>Launch</strong> and the pipeline runs as a background
            job. Progress is reported live; when the run finishes, the app
            automatically switches to the <strong>VISUALIZATIONS</strong> tab
            and opens the new dataset.
          </P>

          {/* ============ Visualization Dashboard ============ */}
          <SectionHeader id="visualization-dashboard">Visualization Dashboard</SectionHeader>
          <P>
            The dashboard is the daily-driver view: a UMAP front-and-center,
            tools on the left, contextual inspectors on the right, and slide-up
            drawers for marker tables, QC, and other long-form panels.
          </P>
          <ScreenshotSlot caption="Full visualization dashboard with UMAP, left rail tools, right inspector, and the bottom drawer collapsed" />

          <SubHeader>Layout</SubHeader>
          <Bullets
            items={[
              <>
                <strong>Top bar</strong> — dataset switcher, color-by selector
                (clusters, annotations, gene expression, QC metrics), and global
                actions like export and resolution explorer.
              </>,
              <>
                <strong>Left rail</strong> — canvas tools: pan, zoom, lasso
                select, and chat scope toggles.
              </>,
              <>
                <strong>Right inspector</strong> — context-aware: selected
                cluster details, annotation editor, gene search, or selection
                stats depending on what you click.
              </>,
              <>
                <strong>Bottom drawer</strong> — slides up for tabular and
                figure-style panels: marker gene heatmap, QC violins, dot plots,
                and volcano plots.
              </>,
            ]}
          />

          <SubHeader>UMAP &amp; lasso selection</SubHeader>
          <P>
            Switch the left-rail tool to <strong>Lasso</strong> and draw a free
            shape around any group of cells. The selection becomes the active
            scope for differential expression, the AI chat, and subclustering.
          </P>
          <ScreenshotSlot caption="UMAP with the lasso tool active and a custom selection of cells highlighted" />

          <SubHeader>Cluster annotation editor &amp; layers</SubHeader>
          <P>
            Click any cluster to inspect its top markers, confidence scores, and
            curated reference annotations side by side. Use{' '}
            <strong>Annotation Manager</strong> to create new metadata columns
            (e.g. a manual <Code>cell_type_v2</Code>) and edit labels in place.
            Annotations are AnnData <Code>.obs</Code> columns and are saved back
            to disk.
          </P>
          <ScreenshotSlot caption="Cluster annotation table next to the annotation manager with a custom layer being edited" />

          <SubHeader>Marker heatmaps, QC violins, dot &amp; volcano plots</SubHeader>
          <Bullets
            items={[
              <>
                <strong>Marker gene heatmap</strong> — top N markers per cluster,
                z-scored by group.
              </>,
              <>
                <strong>QC violins</strong> — counts, genes-per-cell, and
                mitochondrial percentage by cluster or annotation.
              </>,
              <>
                <strong>Dot plots</strong> — gene panel × group; size encodes
                fraction expressing, color encodes mean expression.
              </>,
              <>
                <strong>Volcano plots</strong> — differential expression for any
                two selections (lasso A vs. lasso B, cluster vs. rest, etc.).
              </>,
            ]}
          />
          <ScreenshotSlot caption="Bottom drawer expanded showing the marker gene heatmap; switchable tabs for violins, dot plot, and volcano" />

          <SubHeader>Subclustering workflow</SubHeader>
          <P>
            Lasso (or pick by cluster), open <strong>Subcluster Config</strong>,
            tune resolution and reference databases for the sub-run, and launch.
            The result is a child dataset with its own UMAP and annotations. Use
            <strong> Merge labels back to parent</strong> to push refined cell
            type labels up into the parent <Code>.obs</Code>.
          </P>
          <ScreenshotSlot caption="Subcluster Config modal with selected cell count, resolution, and reference database choices" />

          <SubHeader>Resolution Explorer</SubHeader>
          <P>
            Sweep Leiden resolution across a range and preview each clustering
            side-by-side. Lock the one you like as the active labeling.
          </P>
          <ScreenshotSlot caption="Resolution Explorer showing a small-multiples grid of UMAPs at different Leiden resolutions" />

          <SubHeader>Publication Export Modal</SubHeader>
          <P>
            One-click PNG/SVG export with axis-label, font-size, and DPI
            controls. Useful for dropping the current view straight into a
            figure.
          </P>
          <ScreenshotSlot caption="Publication Export modal with format, DPI, and font controls; live preview on the right" />

          {/* ============ AI Assistant ============ */}
          <SectionHeader id="ai-assistant">AI Bioinformatics Assistant</SectionHeader>
          <P>
            The <strong>Chat Agent</strong> is a context-aware assistant that
            sees what you are looking at on the canvas. Open it from the right
            rail of the dashboard.
          </P>
          <ScreenshotSlot caption="Chat Agent docked to the right of the dashboard with a question about a cluster's heterogeneity" />

          <SubHeader>What it can do</SubHeader>
          <Bullets
            items={[
              <>Interpret QC patterns and flag potential doublets or stress signals.</>,
              <>
                Summarize top markers and propose a cell-type call with cited
                evidence.
              </>,
              <>Detect heterogeneity inside a cluster and suggest subclustering.</>,
              <>
                Run in <em>blind analysis mode</em> where database labels are
                hidden so the model does not parrot existing annotations.
              </>,
            ]}
          />

          <SubHeader>Context modes</SubHeader>
          <Bullets
            items={[
              <>
                <strong>Global dataset</strong> — questions about the whole
                AnnData object (composition, overall QC, etc.).
              </>,
              <>
                <strong>Cluster-specific</strong> — locks scope to the selected
                cluster; markers and stats for just that group are sent.
              </>,
              <>
                <strong>Lasso selection</strong> — uses the cells in your
                current freehand selection as the scope.
              </>,
            ]}
          />

          <SubHeader>Choosing a model provider</SubHeader>
          <P>
            The chat panel has a provider switcher: <strong>OpenAI</strong>{' '}
            (GPT-class models) or <strong>Anthropic</strong> (Claude). Whichever
            providers you have a valid key for in <strong>SETTINGS</strong> will
            be selectable. If both are configured, you can swap mid-conversation
            to compare answers.
          </P>
          <P>
            <strong>Tip:</strong> keys never leave your machine — they are read
            from <Code>backend/.env</Code> server-side and used only to call the
            provider API directly.
          </P>

          {/* ============ Settings ============ */}
          <SectionHeader id="settings">Settings</SectionHeader>
          <P>
            The Settings page handles configuration that is global to the app.
          </P>
          <Bullets
            items={[
              <>
                <strong>API key configuration</strong> — add, replace, validate
                (“Test”), or remove keys for OpenAI and Anthropic. The key is
                masked by default; click the eye icon to reveal while typing.
              </>,
              <>
                <strong>Theme toggle</strong> — switch between CellPilot,
                Default, and Dark themes from the header. Your choice is
                persisted to local storage.
              </>,
              <>
                <strong>Other preferences</strong> — additional toggles will
                appear here as the app grows; they are scoped to this machine.
              </>,
            ]}
          />
          <ScreenshotSlot caption="Settings page with one provider configured (Valid pill) and the other in 'Add key' state" />

          {/* ============ Tips ============ */}
          <SectionHeader id="tips-troubleshooting">Tips &amp; Troubleshooting</SectionHeader>
          <Bullets
            items={[
              <>
                <strong>Large files (&gt;500 MB)</strong> use lazy AnnData
                loading on the backend, so the first plot may take a moment
                while a working slice is computed and cached.
              </>,
              <>
                <strong>GPU is optional.</strong> Everything runs on CPU; if you
                have an NVIDIA GPU with drivers installed, accelerated paths
                (e.g. some scanpy ops, deep models) will be picked up
                automatically.
              </>,
              <>
                <strong>Where outputs live</strong> — every run writes to{' '}
                <Code>output/{'{type}_{name}_{YYYYMMDD_HHMM}'}/</Code> at the
                repo root. The folder name encodes pipeline type, dataset name,
                and timestamp so runs never collide.
              </>,
              <>
                <strong>First-run downloads</strong> — CellTypist models
                download on first selection into the CellTypist cache; PopV's
                default Tabula Sapiens reference model is fetched once on first
                PopV run. Both are cached locally afterwards.
              </>,
              <>
                <strong>Backend logs</strong> — anything unexpected? Check{' '}
                <Code>backend.log</Code> in the repo root for the full server
                trace.
              </>,
              <>
                <strong>AI chat returns an auth error</strong> — open Settings
                and click <strong>Test</strong> on the active provider. An
                expired or rotated key is the most common cause.
              </>,
            ]}
          />
          <ScreenshotSlot caption="Optional: a screenshot of the output/ directory showing several timestamped run folders" />

          <div className="h-12" />
        </article>
      </div>
    </div>
  );
}
