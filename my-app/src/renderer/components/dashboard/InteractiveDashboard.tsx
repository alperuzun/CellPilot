import React, { useState, useEffect } from 'react';
import {
  Box,
  Grid,
  Paper,
  Typography,
  Tabs,
  Tab,
  Card,
  CardContent,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Switch,
  FormControlLabel,
  Button,
  Chip,
  TextField
} from '@mui/material';
import {
  ScatterPlot,
  BarChart,
  Share,
  TableChart,
  Download,
  Visibility
} from '@mui/icons-material';
import { UploadData } from '../wizard/Step1UploadDefine';
import { QCData } from '../wizard/Step2QualityControl';
import { AnalysisData } from '../wizard/Step3ConfigureLaunch';

interface DashboardProps {
  uploadData: UploadData;
  qcData: QCData;
  analysisData: AnalysisData;
  onNewAnalysis: () => void;
}

interface PlotData {
  umap: any;
  cellTypes: string[];
  genes: string[];
  clusters: number[];
  metadata: Record<string, any>;
}

interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}

function TabPanel({ children, value, index }: TabPanelProps) {
  return (
    <div hidden={value !== index} style={{ height: '100%' }}>
      {value === index && <Box sx={{ height: '100%' }}>{children}</Box>}
    </div>
  );
}

export default function InteractiveDashboard({ uploadData, qcData, analysisData, onNewAnalysis }: DashboardProps) {
  const [currentTab, setCurrentTab] = useState(0);
  const [plotData, setPlotData] = useState<PlotData | null>(null);
  const [selectedCells, setSelectedCells] = useState<number[]>([]);

  // UMAP Controls
  const [colorBy, setColorBy] = useState('Cell Type (cellmarker)');
  const [projection, setProjection] = useState('UMAP');
  const [selectedGene, setSelectedGene] = useState('');

  // Visualization Controls
  const [showCellTypes, setShowCellTypes] = useState({
    'T cell': true,
    'Macrophage': true,
    'Natural killer cell': true,
    'Monocyte': true,
    'Mast cell': true,
    'B cell': true,
    'Epithelial': true
  });

  useEffect(() => {
    // Mock data loading
    const mockPlotData: PlotData = {
      umap: {
        x: Array.from({ length: qcData.filteredCellCount }, () => Math.random() * 100 - 50),
        y: Array.from({ length: qcData.filteredCellCount }, () => Math.random() * 100 - 50)
      },
      cellTypes: ['T cell', 'Macrophage', 'Natural killer cell', 'Monocyte', 'Mast cell', 'B cell', 'Epithelial'],
      genes: ['CD3D', 'CD8A', 'CD4', 'FOXP3', 'IL2RA', 'GZMB', 'PRF1', 'CD19', 'MS4A1', 'CD14'],
      clusters: Array.from({ length: qcData.filteredCellCount }, () => Math.floor(Math.random() * 8)),
      metadata: {
        cellCount: qcData.filteredCellCount,
        geneCount: 2000,
        clusters: 8
      }
    };
    setPlotData(mockPlotData);
  }, [qcData.filteredCellCount]);

  const colorByOptions = [
    'Cell Type (cellmarker)',
    'Leiden clusters',
    'Gene expression',
    'QC metrics',
    'Batch',
    'Custom annotation'
  ];

  const projectionOptions = ['UMAP', 'tSNE', 'PCA'];

  return (
    <Box sx={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <Paper elevation={1} sx={{ p: 2, borderRadius: 0 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Box>
            <Typography variant="h5" sx={{ fontWeight: 600 }}>
              {uploadData.datasetName}
            </Typography>
            <Box sx={{ display: 'flex', gap: 1, mt: 1 }}>
              <Chip size="small" label={`${plotData?.metadata.cellCount.toLocaleString()} cells`} />
              <Chip size="small" label={`${plotData?.metadata.geneCount.toLocaleString()} genes`} />
              <Chip size="small" label={`${plotData?.metadata.clusters} clusters`} />
              <Chip size="small" label={`Species: ${uploadData.species}`} />
            </Box>
          </Box>
          <Box sx={{ display: 'flex', gap: 1 }}>
            <Button variant="outlined" startIcon={<Download />}>
              Export
            </Button>
            <Button variant="contained" onClick={onNewAnalysis}>
              New Analysis
            </Button>
          </Box>
        </Box>
      </Paper>

      <Box sx={{ display: 'flex', flex: 1, minHeight: 0 }}>
        {/* Main Content Area */}
        <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
          {/* Navigation Tabs */}
          <Tabs value={currentTab} onChange={(_, v) => setCurrentTab(v)} sx={{ borderBottom: 1, borderColor: 'divider' }}>
            <Tab icon={<ScatterPlot />} iconPosition="start" label="UMAP" />
            <Tab icon={<BarChart />} iconPosition="start" label="Gene Expression" />
            <Tab icon={<Share />} iconPosition="start" label="Cell Communication" />
            <Tab icon={<TableChart />} iconPosition="start" label="Drug Response" />
          </Tabs>

          {/* Tab Content */}
          <Box sx={{ flex: 1, minHeight: 0 }}>
            <TabPanel value={currentTab} index={0}>
              {/* UMAP View */}
              <Box sx={{ height: '100%', p: 2 }}>
                <Card sx={{ height: '100%' }}>
                  <CardContent sx={{ height: '100%', p: 0, '&:last-child': { pb: 0 } }}>
                    <Box sx={{
                      height: '100%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      bgcolor: 'grey.50',
                      border: '1px solid',
                      borderColor: 'grey.200'
                    }}>
                      <Box sx={{ textAlign: 'center' }}>
                        <ScatterPlot sx={{ fontSize: 64, color: 'text.secondary', mb: 2 }} />
                        <Typography variant="h6" gutterBottom>
                          Interactive UMAP Plot
                        </Typography>
                        <Typography variant="body2" color="text.secondary" gutterBottom>
                          {plotData?.metadata.cellCount.toLocaleString()} cells • {plotData?.metadata.clusters} clusters
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                          Click and drag to select cells • Selected: {selectedCells.length}
                        </Typography>
                        <Box sx={{ mt: 2 }}>
                          <Typography variant="caption" color="text.secondary">
                            Colored by: {colorBy}
                          </Typography>
                        </Box>
                      </Box>
                    </Box>
                  </CardContent>
                </Card>
              </Box>
            </TabPanel>

            <TabPanel value={currentTab} index={1}>
              {/* Gene Expression View */}
              <Box sx={{ height: '100%', p: 2 }}>
                <Grid container spacing={2} sx={{ height: '100%' }}>
                  <Grid item xs={6}>
                    <Card sx={{ height: '100%' }}>
                      <CardContent sx={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <Box sx={{ textAlign: 'center' }}>
                          <BarChart sx={{ fontSize: 48, color: 'text.secondary', mb: 1 }} />
                          <Typography variant="h6">Gene Expression Heatmap</Typography>
                          <Typography variant="body2" color="text.secondary">
                            Top marker genes by cell type
                          </Typography>
                        </Box>
                      </CardContent>
                    </Card>
                  </Grid>
                  <Grid item xs={6}>
                    <Card sx={{ height: '100%' }}>
                      <CardContent sx={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <Box sx={{ textAlign: 'center' }}>
                          <ScatterPlot sx={{ fontSize: 48, color: 'text.secondary', mb: 1 }} />
                          <Typography variant="h6">Violin Plots</Typography>
                          <Typography variant="body2" color="text.secondary">
                            Gene expression distribution
                          </Typography>
                        </Box>
                      </CardContent>
                    </Card>
                  </Grid>
                </Grid>
              </Box>
            </TabPanel>

            <TabPanel value={currentTab} index={2}>
              {/* Cell Communication View */}
              <Box sx={{ height: '100%', p: 2 }}>
                <Grid container spacing={2} sx={{ height: '100%' }}>
                  <Grid item xs={8}>
                    <Card sx={{ height: '100%' }}>
                      <CardContent sx={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <Box sx={{ textAlign: 'center' }}>
                          <Share sx={{ fontSize: 64, color: 'text.secondary', mb: 2 }} />
                          <Typography variant="h6">Cell-Cell Communication Network</Typography>
                          <Typography variant="body2" color="text.secondary">
                            Ligand-receptor interactions between cell types
                          </Typography>
                        </Box>
                      </CardContent>
                    </Card>
                  </Grid>
                  <Grid item xs={4}>
                    <Card sx={{ height: '100%' }}>
                      <CardContent>
                        <Typography variant="h6" gutterBottom>
                          Top Interactions
                        </Typography>
                        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                          {['CXCL12-CXCR4', 'TNF-TNFRSF1A', 'IL1B-IL1R1', 'CCL5-CCR5'].map((interaction, index) => (
                            <Chip
                              key={index}
                              label={interaction}
                              size="small"
                              variant="outlined"
                              sx={{ justifyContent: 'flex-start' }}
                            />
                          ))}
                        </Box>
                      </CardContent>
                    </Card>
                  </Grid>
                </Grid>
              </Box>
            </TabPanel>

            <TabPanel value={currentTab} index={3}>
              {/* Drug Response View */}
              <Box sx={{ height: '100%', p: 2 }}>
                <Grid container spacing={2} sx={{ height: '100%' }}>
                  <Grid item xs={6}>
                    <Card sx={{ height: '100%' }}>
                      <CardContent sx={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <Box sx={{ textAlign: 'center' }}>
                          <BarChart sx={{ fontSize: 48, color: 'text.secondary', mb: 1 }} />
                          <Typography variant="h6">Drug Sensitivity Scores</Typography>
                          <Typography variant="body2" color="text.secondary">
                            Predicted response to therapeutic compounds
                          </Typography>
                        </Box>
                      </CardContent>
                    </Card>
                  </Grid>
                  <Grid item xs={6}>
                    <Card sx={{ height: '100%' }}>
                      <CardContent sx={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <Box sx={{ textAlign: 'center' }}>
                          <TableChart sx={{ fontSize: 48, color: 'text.secondary', mb: 1 }} />
                          <Typography variant="h6">CNV Analysis</Typography>
                          <Typography variant="body2" color="text.secondary">
                            Copy number variation profiles
                          </Typography>
                        </Box>
                      </CardContent>
                    </Card>
                  </Grid>
                </Grid>
              </Box>
            </TabPanel>
          </Box>
        </Box>

        {/* Right Sidebar - Controls */}
        <Paper elevation={2} sx={{ width: 320, display: 'flex', flexDirection: 'column', borderRadius: 0 }}>
          <Typography variant="h6" sx={{ p: 2, borderBottom: 1, borderColor: 'divider' }}>
            Controls & Parameters
          </Typography>

          <Box sx={{ flex: 1, overflow: 'auto', p: 2 }}>
            {currentTab === 0 && (
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                {/* Cell Type Filters */}
                <Card>
                  <CardContent>
                    <Typography variant="subtitle1" gutterBottom sx={{ display: 'flex', alignItems: 'center' }}>
                      <Visibility sx={{ mr: 1, fontSize: 20 }} />
                      Cell Type (cellmarker)
                    </Typography>
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                      {Object.entries(showCellTypes).map(([cellType, visible]) => (
                        <FormControlLabel
                          key={cellType}
                          control={
                            <Switch
                              size="small"
                              checked={visible}
                              onChange={(e) => setShowCellTypes(prev => ({ ...prev, [cellType]: e.target.checked }))}
                            />
                          }
                          label={<Typography variant="body2">{cellType}</Typography>}
                        />
                      ))}
                    </Box>
                  </CardContent>
                </Card>

                {/* Visualization Controls */}
                <Card>
                  <CardContent>
                    <Typography variant="subtitle1" gutterBottom>
                      Visualization Controls
                    </Typography>

                    <FormControl fullWidth size="small" sx={{ mb: 2 }}>
                      <InputLabel>Color By</InputLabel>
                      <Select
                        value={colorBy}
                        label="Color By"
                        onChange={(e) => setColorBy(e.target.value)}
                      >
                        {colorByOptions.map((option) => (
                          <MenuItem key={option} value={option}>
                            {option}
                          </MenuItem>
                        ))}
                      </Select>
                    </FormControl>

                    <FormControl fullWidth size="small">
                      <InputLabel>Projection</InputLabel>
                      <Select
                        value={projection}
                        label="Projection"
                        onChange={(e) => setProjection(e.target.value)}
                      >
                        {projectionOptions.map((option) => (
                          <MenuItem key={option} value={option}>
                            {option}
                          </MenuItem>
                        ))}
                      </Select>
                    </FormControl>

                    {colorBy === 'Gene expression' && (
                      <TextField
                        fullWidth
                        size="small"
                        label="Find gene:"
                        value={selectedGene}
                        onChange={(e) => setSelectedGene(e.target.value)}
                        sx={{ mt: 2 }}
                        placeholder="e.g., CD3D, CD8A"
                      />
                    )}
                  </CardContent>
                </Card>
              </Box>
            )}

            {currentTab === 1 && (
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                <Card>
                  <CardContent>
                    <Typography variant="subtitle1" gutterBottom>
                      Gene Selection
                    </Typography>
                    <TextField
                      fullWidth
                      size="small"
                      label="Search genes"
                      placeholder="e.g., CD3D, CD8A, FOXP3"
                    />
                  </CardContent>
                </Card>

                <Card>
                  <CardContent>
                    <Typography variant="subtitle1" gutterBottom>
                      Top Marker Genes
                    </Typography>
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                      {plotData?.genes.slice(0, 5).map((gene, index) => (
                        <Chip
                          key={index}
                          label={gene}
                          size="small"
                          variant="outlined"
                          clickable
                          sx={{ justifyContent: 'flex-start' }}
                        />
                      ))}
                    </Box>
                  </CardContent>
                </Card>
              </Box>
            )}
          </Box>
        </Paper>
      </Box>
    </Box>
  );
}