import React, { useState, useEffect } from 'react';
import {
  Box,
  Container,
  Typography,
  Card,
  CardContent,
  Grid,
  Button,
  Chip,
  Stack,
  Alert,
  CircularProgress,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  ListItemButton,
  Divider,
} from '@mui/material';
import {
  ExpandMore as ExpandMoreIcon,
  InsertChart as ChartIcon,
  Description as FileIcon,
  Image as ImageIcon,
  TableChart as TableIcon,
  Download as DownloadIcon,
  Visibility as VisibilityIcon,
  Science as ScienceIcon,
} from '@mui/icons-material';
import { api } from '../../services/api';

interface OutputFile {
  path: string;
  name: string;
  type: 'image' | 'text' | 'csv' | 'h5ad' | 'other';
  size: number;
  date: string;
  category: string;
}

interface AnalysisResult {
  jobId: string;
  name: string;
  date: string;
  status: 'completed' | 'failed';
  files: OutputFile[];
  annotatedDataset?: string;
}

const OutputsPage: React.FC = () => {
  const [results, setResults] = useState<AnalysisResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadAnalysisResults();
  }, []);

  const loadAnalysisResults = async () => {
    try {
      setLoading(true);

      // Get available datasets which includes analysis outputs
      const response = await api.getAvailableDatasets();

      // Group datasets by analysis run
      const analysisMap = new Map<string, AnalysisResult>();

      response.datasets.forEach(dataset => {
        const pathParts = dataset.path.split('/');
        const outputIndex = pathParts.findIndex(part => part === 'output');

        if (outputIndex > -1 && outputIndex + 1 < pathParts.length) {
          const analysisName = pathParts[outputIndex + 1];

          if (!analysisMap.has(analysisName)) {
            analysisMap.set(analysisName, {
              jobId: analysisName,
              name: analysisName,
              date: dataset.date,
              status: 'completed',
              files: [],
              annotatedDataset: undefined,
            });
          }

          const result = analysisMap.get(analysisName)!;

          // Determine file type and category
          let fileType: OutputFile['type'] = 'other';
          let category = 'Other';

          if (dataset.path.endsWith('.h5ad')) {
            fileType = 'h5ad';
            category = 'Processed Data';
            if (dataset.path.includes('annotated')) {
              result.annotatedDataset = dataset.path;
            }
          } else if (dataset.path.endsWith('.png') || dataset.path.endsWith('.jpg')) {
            fileType = 'image';
            category = 'Visualizations';
          } else if (dataset.path.endsWith('.csv')) {
            fileType = 'csv';
            category = 'Data Tables';
          } else if (dataset.path.endsWith('.txt')) {
            fileType = 'text';
            category = 'Reports';
          }

          result.files.push({
            path: dataset.path,
            name: dataset.name,
            type: fileType,
            size: dataset.size_mb,
            date: dataset.date,
            category: category,
          });
        }
      });

      setResults(Array.from(analysisMap.values()).sort((a, b) =>
        new Date(b.date).getTime() - new Date(a.date).getTime()
      ));

    } catch (err) {
      console.error('Error loading analysis results:', err);
      setError('Failed to load analysis results');
    } finally {
      setLoading(false);
    }
  };

  const getFileIcon = (type: OutputFile['type']) => {
    switch (type) {
      case 'image': return <ImageIcon />;
      case 'csv': return <TableIcon />;
      case 'text': return <FileIcon />;
      case 'h5ad': return <ScienceIcon />;
      default: return <FileIcon />;
    }
  };

  const handleViewFile = async (file: OutputFile) => {
    if (file.type === 'image') {
      // Open image in new window
      const imageUrl = api.getPreviewImageUrl(file.path);
      window.open(imageUrl, '_blank');
    } else if (file.type === 'csv') {
      // Open CSV preview
      const csvUrl = api.getPreviewCsvUrl(file.path);
      window.open(csvUrl, '_blank');
    } else if (file.type === 'text') {
      // Open text preview
      const textUrl = api.getPreviewTextUrl(file.path);
      window.open(textUrl, '_blank');
    }
  };

  const handleViewVisualizations = (result: AnalysisResult) => {
    // This will be called when user wants to go to visualizations
    // We'll need to pass this up to the parent component
    if (result.annotatedDataset) {
      // Emit event or use context to switch to visualizations tab
      window.dispatchEvent(new CustomEvent('switchToVisualizations', {
        detail: { datasetPath: result.annotatedDataset }
      }));
    }
  };

  const groupFilesByCategory = (files: OutputFile[]) => {
    const grouped = files.reduce((acc, file) => {
      if (!acc[file.category]) {
        acc[file.category] = [];
      }
      acc[file.category].push(file);
      return acc;
    }, {} as Record<string, OutputFile[]>);

    return grouped;
  };

  if (loading) {
    return (
      <Container maxWidth="xl" sx={{ py: 4 }}>
        <Box display="flex" justifyContent="center" alignItems="center" minHeight={400}>
          <Stack alignItems="center" spacing={2}>
            <CircularProgress size={60} />
            <Typography variant="h6">Loading analysis results...</Typography>
          </Stack>
        </Box>
      </Container>
    );
  }

  if (error) {
    return (
      <Container maxWidth="xl" sx={{ py: 4 }}>
        <Alert severity="error">
          <Typography variant="h6">Failed to load analysis results</Typography>
          <Typography variant="body2">{error}</Typography>
        </Alert>
      </Container>
    );
  }

  return (
    <Container maxWidth="xl" sx={{ py: 4 }}>
      <Stack spacing={4}>
        <Box>
          <Typography variant="h3" component="h1" gutterBottom>
            Analysis Outputs
          </Typography>
          <Typography variant="body1" color="text.secondary" gutterBottom>
            View and download results from your completed analysis runs.
          </Typography>
        </Box>

        {results.length === 0 ? (
          <Card>
            <CardContent>
              <Box textAlign="center" py={8}>
                <ChartIcon sx={{ fontSize: 60, color: 'text.secondary', mb: 2 }} />
                <Typography variant="h5" gutterBottom>
                  No Analysis Results Yet
                </Typography>
                <Typography color="text.secondary">
                  Run an analysis to see results here. Switch to the Analysis tab to get started.
                </Typography>
              </Box>
            </CardContent>
          </Card>
        ) : (
          <Stack spacing={3}>
            {results.map((result) => {
              const groupedFiles = groupFilesByCategory(result.files);

              return (
                <Card key={result.jobId}>
                  <CardContent>
                    <Stack spacing={2}>
                      {/* Header */}
                      <Box display="flex" justifyContent="space-between" alignItems="center">
                        <Box>
                          <Typography variant="h5" gutterBottom>
                            {result.name}
                          </Typography>
                          <Stack direction="row" spacing={2} alignItems="center">
                            <Chip
                              label={result.status === 'completed' ? 'Completed' : 'Failed'}
                              color={result.status === 'completed' ? 'success' : 'error'}
                              size="small"
                            />
                            <Typography variant="body2" color="text.secondary">
                              {result.date} • {result.files.length} files
                            </Typography>
                          </Stack>
                        </Box>

                        {result.annotatedDataset && (
                          <Button
                            variant="contained"
                            startIcon={<VisibilityIcon />}
                            onClick={() => handleViewVisualizations(result)}
                            size="large"
                          >
                            View Visualizations
                          </Button>
                        )}
                      </Box>

                      <Divider />

                      {/* Files organized by category */}
                      <Stack spacing={2}>
                        {Object.entries(groupedFiles).map(([category, categoryFiles]) => (
                          <Accordion key={category} defaultExpanded>
                            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                              <Typography variant="h6">
                                {category} ({categoryFiles.length})
                              </Typography>
                            </AccordionSummary>
                            <AccordionDetails>
                              <List dense>
                                {categoryFiles.map((file) => (
                                  <ListItem key={file.path} disablePadding>
                                    <ListItemButton onClick={() => handleViewFile(file)}>
                                      <ListItemIcon>
                                        {getFileIcon(file.type)}
                                      </ListItemIcon>
                                      <ListItemText
                                        primary={file.name}
                                        secondary={`${file.size} MB • ${file.date}`}
                                      />
                                      <Box>
                                        {(file.type === 'image' || file.type === 'csv' || file.type === 'text') && (
                                          <Button
                                            startIcon={<VisibilityIcon />}
                                            size="small"
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              handleViewFile(file);
                                            }}
                                          >
                                            View
                                          </Button>
                                        )}
                                      </Box>
                                    </ListItemButton>
                                  </ListItem>
                                ))}
                              </List>
                            </AccordionDetails>
                          </Accordion>
                        ))}
                      </Stack>
                    </Stack>
                  </CardContent>
                </Card>
              );
            })}
          </Stack>
        )}

        {/* Refresh button */}
        <Box display="flex" justifyContent="center">
          <Button
            variant="outlined"
            onClick={loadAnalysisResults}
            disabled={loading}
          >
            Refresh Results
          </Button>
        </Box>
      </Stack>
    </Container>
  );
};

export default OutputsPage;