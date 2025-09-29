import React, { useState } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Grid,
  Stack,
  Chip,
  Dialog,
  DialogContent,
  DialogTitle,
  IconButton,
  Tooltip,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import ZoomInIcon from '@mui/icons-material/ZoomIn';
import { AnalysisFile } from '../../services/api';

interface AnnotationResultsProps {
  analysisFiles: AnalysisFile[];
}

const AnnotationResults: React.FC<AnnotationResultsProps> = ({ analysisFiles }) => {
  const [selectedImage, setSelectedImage] = useState<AnalysisFile | null>(null);

  // Separate files by type
  const dotplotFiles = analysisFiles.filter(file => file.type === 'dotplot');
  const clusterPlotFiles = analysisFiles.filter(file => file.type === 'cluster_plot');
  const annotationPlotFiles = analysisFiles.filter(file => file.type === 'annotation_plot');
  const networkPlotFiles = analysisFiles.filter(file => file.type === 'network_plot');
  const heatmapFiles = analysisFiles.filter(file => file.type === 'heatmap');
  const otherPlotFiles = analysisFiles.filter(file => file.type === 'other_plot');
  const dataFiles = analysisFiles.filter(file => file.type === 'csv_data');
  const textFiles = analysisFiles.filter(file => file.type === 'text_file');
  const reportFiles = analysisFiles.filter(file => ['html_report', 'pdf_report'].includes(file.type));

  const getImageUrl = (file: AnalysisFile) => {
    const baseUrl = 'http://127.0.0.1:8000';
    return `${baseUrl}/preview_img?path=${encodeURIComponent(file.path)}`;
  };

  const getTypeLabel = (type: string) => {
    switch (type) {
      case 'dotplot':
        return 'Gene Expression Dotplot';
      case 'cluster_plot':
        return 'Cluster Visualization';
      case 'annotation_plot':
        return 'Annotation Plot';
      case 'network_plot':
        return 'Network Plot';
      case 'heatmap':
        return 'Heatmap';
      case 'other_plot':
        return 'Analysis Plot';
      case 'csv_data':
        return 'CSV Data';
      case 'text_file':
        return 'Text File';
      case 'html_report':
        return 'HTML Report';
      case 'pdf_report':
        return 'PDF Report';
      default:
        return 'Analysis File';
    }
  };

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'dotplot':
        return 'primary';
      case 'cluster_plot':
        return 'secondary';
      case 'annotation_plot':
        return 'success';
      case 'network_plot':
        return 'info';
      case 'heatmap':
        return 'warning';
      case 'other_plot':
        return 'default';
      case 'csv_data':
        return 'info';
      case 'text_file':
        return 'default';
      case 'html_report':
        return 'success';
      case 'pdf_report':
        return 'error';
      default:
        return 'default';
    }
  };

  const ImageCard: React.FC<{ file: AnalysisFile }> = ({ file }) => (
    <Card
      sx={{
        cursor: 'pointer',
        transition: 'all 0.2s',
        '&:hover': {
          transform: 'translateY(-2px)',
          boxShadow: 4,
        },
      }}
      onClick={() => setSelectedImage(file)}
    >
      <Box sx={{ position: 'relative' }}>
        <img
          src={getImageUrl(file)}
          alt={file.name}
          style={{
            width: '100%',
            height: '200px',
            objectFit: 'contain',
            backgroundColor: '#fafafa',
          }}
          onError={(e) => {
            const target = e.target as HTMLImageElement;
            target.style.display = 'none';
            if (target.nextSibling) {
              (target.nextSibling as HTMLElement).style.display = 'flex';
            }
          }}
        />
        <Box
          sx={{
            display: 'none',
            alignItems: 'center',
            justifyContent: 'center',
            height: '200px',
            backgroundColor: '#f5f5f5',
            color: 'text.secondary',
          }}
        >
          <Typography variant="body2">Image not available</Typography>
        </Box>

        {/* Overlay */}
        <Box
          sx={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0,0,0,0.4)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            opacity: 0,
            transition: 'opacity 0.2s',
            '&:hover': { opacity: 1 },
          }}
        >
          <Tooltip title="Click to enlarge">
            <ZoomInIcon sx={{ color: 'white', fontSize: 32 }} />
          </Tooltip>
        </Box>
      </Box>

      <CardContent sx={{ p: 2 }}>
        <Stack spacing={1}>
          <Typography variant="subtitle2" noWrap>
            {file.name.replace(/_/g, ' ').replace(/^\w/, c => c.toUpperCase())}
          </Typography>
          <Stack direction="row" spacing={1} alignItems="center">
            <Chip
              label={getTypeLabel(file.type)}
              color={getTypeColor(file.type) as any}
              size="small"
              variant="outlined"
            />
            <Chip
              label={`${file.size_mb} MB`}
              size="small"
              variant="outlined"
            />
          </Stack>
        </Stack>
      </CardContent>
    </Card>
  );

  const FileCard: React.FC<{ file: AnalysisFile }> = ({ file }) => (
    <Card
      sx={{
        cursor: 'pointer',
        transition: 'all 0.2s',
        '&:hover': {
          transform: 'translateY(-2px)',
          boxShadow: 4,
        },
      }}
      onClick={() => {
        // Open file in new window/tab
        const baseUrl = 'http://127.0.0.1:8000';
        let url;
        if (file.type === 'csv_data') {
          url = `${baseUrl}/preview_csv?path=${encodeURIComponent(file.path)}`;
        } else if (file.type === 'text_file') {
          url = `${baseUrl}/preview_txt?path=${encodeURIComponent(file.path)}`;
        } else if (file.type === 'html_report') {
          url = file.path; // Direct file path for HTML
        } else {
          url = file.path; // Direct file path for PDF and others
        }
        window.open(url, '_blank');
      }}
    >
      <CardContent sx={{ p: 2 }}>
        <Stack spacing={1}>
          <Typography variant="subtitle2" noWrap>
            {file.name.replace(/_/g, ' ').replace(/^\w/, c => c.toUpperCase())}
          </Typography>
          <Stack direction="row" spacing={1} alignItems="center">
            <Chip
              label={getTypeLabel(file.type)}
              color={getTypeColor(file.type) as any}
              size="small"
              variant="outlined"
            />
            <Chip
              label={`${file.size_mb} MB`}
              size="small"
              variant="outlined"
            />
          </Stack>
        </Stack>
      </CardContent>
    </Card>
  );

  const SectionTitle: React.FC<{ title: string; count: number }> = ({ title, count }) => (
    <Stack direction="row" spacing={2} alignItems="center">
      <Typography variant="h6">{title}</Typography>
      <Chip label={`${count} files`} size="small" variant="outlined" />
    </Stack>
  );

  if (analysisFiles.length === 0) {
    return (
      <Card>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            Analysis Results
          </Typography>
          <Typography color="text.secondary">
            No analysis results available. Analysis outputs will appear here after running annotation,
            CellPhoneDB, or other analysis pipelines.
          </Typography>
        </CardContent>
      </Card>
    );
  }

  return (
    <Stack spacing={4}>
      {/* Dotplots */}
      {dotplotFiles.length > 0 && (
        <Box>
          <SectionTitle title="Gene Expression Dotplots" count={dotplotFiles.length} />
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Dotplots showing gene expression levels (color intensity) and fraction of expressing cells (dot size) across cell types.
          </Typography>
          <Grid container spacing={3}>
            {dotplotFiles.map((file, index) => (
              <Grid item xs={12} sm={6} md={4} key={index}>
                <ImageCard file={file} />
              </Grid>
            ))}
          </Grid>
        </Box>
      )}

      {/* Cluster Plots */}
      {clusterPlotFiles.length > 0 && (
        <Box>
          <SectionTitle title="Cluster Visualizations" count={clusterPlotFiles.length} />
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            UMAP embeddings showing identified cell clusters and their spatial relationships.
          </Typography>
          <Grid container spacing={3}>
            {clusterPlotFiles.map((file, index) => (
              <Grid item xs={12} sm={6} md={4} key={index}>
                <ImageCard file={file} />
              </Grid>
            ))}
          </Grid>
        </Box>
      )}

      {/* Annotation Plots */}
      {annotationPlotFiles.length > 0 && (
        <Box>
          <SectionTitle title="Annotation Results" count={annotationPlotFiles.length} />
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Cell type annotation results showing predicted cell types overlaid on the UMAP embedding.
          </Typography>
          <Grid container spacing={3}>
            {annotationPlotFiles.map((file, index) => (
              <Grid item xs={12} sm={6} md={4} key={index}>
                <ImageCard file={file} />
              </Grid>
            ))}
          </Grid>
        </Box>
      )}

      {/* Network Plots */}
      {networkPlotFiles.length > 0 && (
        <Box>
          <SectionTitle title="Network Plots" count={networkPlotFiles.length} />
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Cell-cell communication networks and interaction plots from CellPhoneDB analysis.
          </Typography>
          <Grid container spacing={3}>
            {networkPlotFiles.map((file, index) => (
              <Grid item xs={12} sm={6} md={4} key={index}>
                <ImageCard file={file} />
              </Grid>
            ))}
          </Grid>
        </Box>
      )}

      {/* Heatmaps */}
      {heatmapFiles.length > 0 && (
        <Box>
          <SectionTitle title="Heatmaps" count={heatmapFiles.length} />
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Heatmaps showing gene expression patterns, interaction strengths, or other quantitative data.
          </Typography>
          <Grid container spacing={3}>
            {heatmapFiles.map((file, index) => (
              <Grid item xs={12} sm={6} md={4} key={index}>
                <ImageCard file={file} />
              </Grid>
            ))}
          </Grid>
        </Box>
      )}

      {/* Other Analysis Plots */}
      {otherPlotFiles.length > 0 && (
        <Box>
          <SectionTitle title="Other Analysis Plots" count={otherPlotFiles.length} />
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Additional analysis visualizations and plots generated during the pipeline.
          </Typography>
          <Grid container spacing={3}>
            {otherPlotFiles.map((file, index) => (
              <Grid item xs={12} sm={6} md={4} key={index}>
                <ImageCard file={file} />
              </Grid>
            ))}
          </Grid>
        </Box>
      )}

      {/* Data Files */}
      {dataFiles.length > 0 && (
        <Box>
          <SectionTitle title="Data Files" count={dataFiles.length} />
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            CSV data files containing quantitative results, gene expression matrices, and statistical outputs. Click to download or preview.
          </Typography>
          <Grid container spacing={3}>
            {dataFiles.map((file, index) => (
              <Grid item xs={12} sm={6} md={4} key={index}>
                <FileCard file={file} />
              </Grid>
            ))}
          </Grid>
        </Box>
      )}

      {/* Text Files */}
      {textFiles.length > 0 && (
        <Box>
          <SectionTitle title="Text Files" count={textFiles.length} />
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Text files containing detailed results, marker gene lists, and analysis summaries. Click to view content.
          </Typography>
          <Grid container spacing={3}>
            {textFiles.map((file, index) => (
              <Grid item xs={12} sm={6} md={4} key={index}>
                <FileCard file={file} />
              </Grid>
            ))}
          </Grid>
        </Box>
      )}

      {/* Reports */}
      {reportFiles.length > 0 && (
        <Box>
          <SectionTitle title="Analysis Reports" count={reportFiles.length} />
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Comprehensive HTML and PDF reports containing detailed analysis results and visualizations.
          </Typography>
          <Grid container spacing={3}>
            {reportFiles.map((file, index) => (
              <Grid item xs={12} sm={6} md={4} key={index}>
                <FileCard file={file} />
              </Grid>
            ))}
          </Grid>
        </Box>
      )}

      {/* Image Modal */}
      <Dialog
        open={!!selectedImage}
        onClose={() => setSelectedImage(null)}
        maxWidth="lg"
        fullWidth
        PaperProps={{
          sx: { minHeight: '80vh' },
        }}
      >
        {selectedImage && (
          <>
            <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Stack spacing={1}>
                <Typography variant="h6">
                  {selectedImage.name.replace(/_/g, ' ').replace(/^\w/, c => c.toUpperCase())}
                </Typography>
                <Chip
                  label={getTypeLabel(selectedImage.type)}
                  color={getTypeColor(selectedImage.type) as any}
                  size="small"
                  variant="outlined"
                />
              </Stack>
              <IconButton onClick={() => setSelectedImage(null)} size="small">
                <CloseIcon />
              </IconButton>
            </DialogTitle>
            <DialogContent sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
              <img
                src={getImageUrl(selectedImage)}
                alt={selectedImage.name}
                style={{
                  maxWidth: '100%',
                  maxHeight: '70vh',
                  objectFit: 'contain',
                }}
              />
            </DialogContent>
          </>
        )}
      </Dialog>
    </Stack>
  );
};

export default AnnotationResults;