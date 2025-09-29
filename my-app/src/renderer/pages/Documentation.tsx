import React, { useState } from 'react';
import { 
  Box, 
  Typography, 
  Card, 
  CardContent, 
  Accordion,
  AccordionSummary,
  AccordionDetails,
  List,
  ListItem,
  ListItemText,
  ListItemIcon,
  Chip,
  Stack,
  Alert,
  Paper,
  Step,
  StepLabel,
  Stepper
} from '@mui/material';
import { 
  ExpandMore,
  Upload,
  Analytics,
  Share,
  Science,
  PlayArrow,
  CheckCircle,
  Info,
  Settings,
  Insights
} from '@mui/icons-material';

export default function Documentation() {
  const [expanded, setExpanded] = useState<string | false>('getting-started');

  const handleChange = (panel: string) => (event: React.SyntheticEvent, isExpanded: boolean) => {
    setExpanded(isExpanded ? panel : false);
  };

  const workflowSteps = [
    'Upload Data',
    'Quality Control',
    'Cell Annotation',
    'Advanced Analysis',
    'Export Results'
  ];

  return (
    <Box sx={{ p: 3, maxWidth: 1200, mx: 'auto' }}>
      {/* Header */}
      <Box sx={{ textAlign: 'center', mb: 4 }}>
        <Typography variant="h3" component="h1" gutterBottom color="primary">
          CellPilot Documentation
        </Typography>
        <Typography variant="h6" color="text.secondary">
          Complete guide to single-cell RNA-seq analysis with CellPilot
        </Typography>
      </Box>

      {/* Quick Start Alert */}
      <Alert severity="info" sx={{ mb: 3 }}>
        <Typography variant="body2">
          <strong>New to CellPilot?</strong> Start with the "Getting Started" section below to understand 
          the basic workflow. For specific analysis types, jump to the relevant sections.
        </Typography>
      </Alert>

      {/* Workflow Overview */}
      <Card elevation={2} sx={{ mb: 3 }}>
        <CardContent>
          <Typography variant="h5" gutterBottom sx={{ display: 'flex', alignItems: 'center' }}>
            <Insights sx={{ mr: 1, color: 'primary.main' }} />
            Analysis Workflow
          </Typography>
          <Typography variant="body1" paragraph color="text.secondary">
            CellPilot follows a structured analysis pipeline designed to take you from raw data to biological insights:
          </Typography>
          <Stepper alternativeLabel sx={{ mt: 2 }}>
            {workflowSteps.map((label) => (
              <Step key={label} active>
                <StepLabel>{label}</StepLabel>
              </Step>
            ))}
          </Stepper>
        </CardContent>
      </Card>

      {/* Documentation Sections */}
      <Stack spacing={2}>
        
        {/* Getting Started */}
        <Accordion expanded={expanded === 'getting-started'} onChange={handleChange('getting-started')}>
          <AccordionSummary expandIcon={<ExpandMore />}>
            <Box sx={{ display: 'flex', alignItems: 'center', width: '100%' }}>
              <PlayArrow sx={{ mr: 1, color: 'primary.main' }} />
              <Typography variant="h6">Getting Started</Typography>
              <Chip label="Essential" color="primary" size="small" sx={{ ml: 'auto', mr: 2 }} />
            </Box>
          </AccordionSummary>
          <AccordionDetails>
            <Stack spacing={3}>
              <Typography variant="body1">
                Welcome to CellPilot! This section will guide you through your first analysis.
              </Typography>
              
              <Paper variant="outlined" sx={{ p: 2 }}>
                <Typography variant="h6" gutterBottom color="primary">
                  📋 Prerequisites
                </Typography>
                <List dense>
                  <ListItem>
                    <ListItemIcon><CheckCircle color="success" /></ListItemIcon>
                    <ListItemText primary="Single-cell RNA-seq data in supported formats (.h5ad, .h5, .hdf5)" />
                  </ListItem>
                  <ListItem>
                    <ListItemIcon><CheckCircle color="success" /></ListItemIcon>
                    <ListItemText primary="At least 8GB RAM (16GB recommended for large datasets)" />
                  </ListItem>
                  <ListItem>
                    <ListItemIcon><CheckCircle color="success" /></ListItemIcon>
                    <ListItemText primary="Sufficient disk space for output files (~2-5x input file size)" />
                  </ListItem>
                </List>
              </Paper>

              <Paper variant="outlined" sx={{ p: 2 }}>
                <Typography variant="h6" gutterBottom color="primary">
                  🚀 Quick Start Steps
                </Typography>
                <List>
                  <ListItem>
                    <ListItemText 
                      primary="1. Upload Your Data" 
                      secondary="Click 'Upload File' and select your .h5ad or compatible file" 
                    />
                  </ListItem>
                  <ListItem>
                    <ListItemText 
                      primary="2. Review Data Summary" 
                      secondary="Check the data preview to ensure proper loading" 
                    />
                  </ListItem>
                  <ListItem>
                    <ListItemText 
                      primary="3. Configure Analysis" 
                      secondary="Choose annotation databases and analysis parameters" 
                    />
                  </ListItem>
                  <ListItem>
                    <ListItemText 
                      primary="4. Run Analysis" 
                      secondary="Execute the pipeline and monitor progress" 
                    />
                  </ListItem>
                  <ListItem>
                    <ListItemText 
                      primary="5. Explore Results" 
                      secondary="Review visualizations and export findings" 
                    />
                  </ListItem>
                </List>
              </Paper>
            </Stack>
          </AccordionDetails>
        </Accordion>

        {/* File Upload & Data Management */}
        <Accordion expanded={expanded === 'data-upload'} onChange={handleChange('data-upload')}>
          <AccordionSummary expandIcon={<ExpandMore />}>
            <Box sx={{ display: 'flex', alignItems: 'center', width: '100%' }}>
              <Upload sx={{ mr: 1, color: 'primary.main' }} />
              <Typography variant="h6">Data Upload & Management</Typography>
            </Box>
          </AccordionSummary>
          <AccordionDetails>
            <Stack spacing={3}>
              <Typography variant="body1">
                CellPilot supports multiple single-cell data formats and provides comprehensive data validation.
              </Typography>

              <Paper variant="outlined" sx={{ p: 2 }}>
                <Typography variant="h6" gutterBottom color="primary">
                  📁 Supported File Formats
                </Typography>
                <List dense>
                  <ListItem>
                    <ListItemText 
                      primary=".h5ad (AnnData HDF5)" 
                      secondary="Preferred format - includes metadata, annotations, and processed matrices"
                    />
                  </ListItem>
                  <ListItem>
                    <ListItemText 
                      primary=".h5 / .hdf5 (HDF5)" 
                      secondary="Raw HDF5 matrices from Cell Ranger or similar tools"
                    />
                  </ListItem>
                </List>
              </Paper>

              <Alert severity="warning">
                <Typography variant="body2">
                  <strong>File Size Considerations:</strong> Large datasets (&gt;1GB) may require additional 
                  processing time. Ensure adequate system resources are available.
                </Typography>
              </Alert>

              <Paper variant="outlined" sx={{ p: 2 }}>
                <Typography variant="h6" gutterBottom color="primary">
                  ✅ Data Quality Checks
                </Typography>
                <Typography variant="body2" paragraph>
                  CellPilot automatically performs several validation steps:
                </Typography>
                <List dense>
                  <ListItem>
                    <ListItemIcon><CheckCircle fontSize="small" /></ListItemIcon>
                    <ListItemText secondary="Matrix format and structure validation" />
                  </ListItem>
                  <ListItem>
                    <ListItemIcon><CheckCircle fontSize="small" /></ListItemIcon>
                    <ListItemText secondary="Gene and cell barcode integrity checks" />
                  </ListItem>
                  <ListItem>
                    <ListItemIcon><CheckCircle fontSize="small" /></ListItemIcon>
                    <ListItemText secondary="Missing value and sparse matrix assessment" />
                  </ListItem>
                </List>
              </Paper>
            </Stack>
          </AccordionDetails>
        </Accordion>

        {/* Cell Annotation */}
        <Accordion expanded={expanded === 'annotation'} onChange={handleChange('annotation')}>
          <AccordionSummary expandIcon={<ExpandMore />}>
            <Box sx={{ display: 'flex', alignItems: 'center', width: '100%' }}>
              <Analytics sx={{ mr: 1, color: 'primary.main' }} />
              <Typography variant="h6">Cell Type Annotation</Typography>
              <Chip label="Core Feature" color="secondary" size="small" sx={{ ml: 'auto', mr: 2 }} />
            </Box>
          </AccordionSummary>
          <AccordionDetails>
            <Stack spacing={3}>
              <Typography variant="body1">
                Automated cell type identification using comprehensive reference databases and 
                machine learning approaches.
              </Typography>

              <Paper variant="outlined" sx={{ p: 2 }}>
                <Typography variant="h6" gutterBottom color="primary">
                  🎯 Annotation Process
                </Typography>
                <List>
                  <ListItem>
                    <ListItemText 
                      primary="Preprocessing Pipeline" 
                      secondary="Quality control, normalization, feature selection, and dimensionality reduction"
                    />
                  </ListItem>
                  <ListItem>
                    <ListItemText 
                      primary="Clustering Analysis" 
                      secondary="Leiden algorithm for community detection with optimized resolution"
                    />
                  </ListItem>
                  <ListItem>
                    <ListItemText 
                      primary="Marker Gene Identification" 
                      secondary="Statistical testing to identify cluster-specific expression signatures"
                    />
                  </ListItem>
                  <ListItem>
                    <ListItemText 
                      primary="Reference Database Matching" 
                      secondary="Comparison against curated cell type markers from multiple databases"
                    />
                  </ListItem>
                </List>
              </Paper>

              <Paper variant="outlined" sx={{ p: 2 }}>
                <Typography variant="h6" gutterBottom color="primary">
                  📚 Reference Databases
                </Typography>
                <Stack spacing={1}>
                  <Chip label="CellMarker" variant="outlined" />
                  <Typography variant="body2" color="text.secondary">
                    Comprehensive database of cell markers for human and mouse tissues
                  </Typography>
                  
                  <Chip label="PanglaoDB" variant="outlined" />
                  <Typography variant="body2" color="text.secondary">
                    Single-cell sequencing experiments database with curated cell type annotations
                  </Typography>
                  
                  <Chip label="Cancer Single Cell Atlas" variant="outlined" />
                  <Typography variant="body2" color="text.secondary">
                    Specialized markers for cancer cell types and tumor microenvironment
                  </Typography>
                  
                  <Chip label="Manual Annotation" variant="outlined" />
                  <Typography variant="body2" color="text.secondary">
                    Upload custom marker gene files (CSV/TSV format) for personalized cell type annotation
                  </Typography>
                </Stack>
              </Paper>

              <Paper variant="outlined" sx={{ p: 2 }}>
                <Typography variant="h6" gutterBottom color="primary">
                  📝 Manual Annotation Setup
                </Typography>
                <Typography variant="body2" paragraph>
                  Create a custom marker file with your own gene signatures:
                </Typography>
                <List dense>
                  <ListItem>
                    <ListItemText 
                      primary="File Format" 
                      secondary="CSV or TSV file with 'cell_type' and 'gene' columns" 
                    />
                  </ListItem>
                  <ListItem>
                    <ListItemText 
                      primary="Example Entry" 
                      secondary="T cell,CD3D | B cell,CD19 | Macrophage,CD68" 
                    />
                  </ListItem>
                  <ListItem>
                    <ListItemText 
                      primary="Gene Symbols" 
                      secondary="Use standard gene symbols that match your dataset" 
                    />
                  </ListItem>
                </List>
              </Paper>
            </Stack>
          </AccordionDetails>
        </Accordion>

        {/* Cell Communication Analysis */}
        <Accordion expanded={expanded === 'communication'} onChange={handleChange('communication')}>
          <AccordionSummary expandIcon={<ExpandMore />}>
            <Box sx={{ display: 'flex', alignItems: 'center', width: '100%' }}>
              <Share sx={{ mr: 1, color: 'primary.main' }} />
              <Typography variant="h6">Cell-Cell Communication</Typography>
            </Box>
          </AccordionSummary>
          <AccordionDetails>
            <Stack spacing={3}>
              <Typography variant="body1">
                Analyze intercellular communication networks through ligand-receptor interaction analysis 
                powered by CellPhoneDB.
              </Typography>

              <Paper variant="outlined" sx={{ p: 2 }}>
                <Typography variant="h6" gutterBottom color="primary">
                  🔗 Analysis Features
                </Typography>
                <List dense>
                  <ListItem>
                    <ListItemIcon><CheckCircle color="success" /></ListItemIcon>
                    <ListItemText primary="Ligand-receptor pair identification and scoring" />
                  </ListItem>
                  <ListItem>
                    <ListItemIcon><CheckCircle color="success" /></ListItemIcon>
                    <ListItemText primary="Statistical significance testing with permutation analysis" />
                  </ListItem>
                  <ListItem>
                    <ListItemIcon><CheckCircle color="success" /></ListItemIcon>
                    <ListItemText primary="Interactive network visualizations" />
                  </ListItem>
                  <ListItem>
                    <ListItemIcon><CheckCircle color="success" /></ListItemIcon>
                    <ListItemText primary="Cell type-specific communication profiles" />
                  </ListItem>
                </List>
              </Paper>

              <Alert severity="info">
                <Typography variant="body2">
                  <strong>Input Requirements:</strong> This analysis requires annotated single-cell data 
                  with cell type labels. Run the annotation pipeline first if needed.
                </Typography>
              </Alert>
            </Stack>
          </AccordionDetails>
        </Accordion>

        {/* Drug Response & Tumor Analysis */}
        <Accordion expanded={expanded === 'drug-response'} onChange={handleChange('drug-response')}>
          <AccordionSummary expandIcon={<ExpandMore />}>
            <Box sx={{ display: 'flex', alignItems: 'center', width: '100%' }}>
              <Science sx={{ mr: 1, color: 'primary.main' }} />
              <Typography variant="h6">Drug Response & Tumor Analysis</Typography>
              <Chip label="Advanced" color="warning" size="small" sx={{ ml: 'auto', mr: 2 }} />
            </Box>
          </AccordionSummary>
          <AccordionDetails>
            <Stack spacing={3}>
              <Typography variant="body1">
                Advanced analysis combining copy number variation detection with drug sensitivity prediction 
                for precision medicine applications.
              </Typography>

              <Paper variant="outlined" sx={{ p: 2 }}>
                <Typography variant="h6" gutterBottom color="primary">
                  🧬 InferCNV Analysis
                </Typography>
                <Typography variant="body2" paragraph>
                  Identifies malignant cells through copy number variation patterns:
                </Typography>
                <List dense>
                  <ListItem>
                    <ListItemText secondary="Genomic coordinate mapping using GTF annotations" />
                  </ListItem>
                  <ListItem>
                    <ListItemText secondary="CNV score calculation across chromosomal regions" />
                  </ListItem>
                  <ListItem>
                    <ListItemText secondary="Tumor vs. normal cell classification" />
                  </ListItem>
                </List>
              </Paper>

              <Paper variant="outlined" sx={{ p: 2 }}>
                <Typography variant="h6" gutterBottom color="primary">
                  💊 CaDRReS-Sc Drug Prediction
                </Typography>
                <Typography variant="body2" paragraph>
                  Predicts drug sensitivity using machine learning models trained on large-scale pharmacogenomics data:
                </Typography>
                <List dense>
                  <ListItem>
                    <ListItemText secondary="IC50 prediction for hundreds of compounds" />
                  </ListItem>
                  <ListItem>
                    <ListItemText secondary="Cell type-specific drug response profiles" />
                  </ListItem>
                  <ListItem>
                    <ListItemText secondary="Integration with GDSC and other drug databases" />
                  </ListItem>
                </List>
              </Paper>

              <Alert severity="warning">
                <Typography variant="body2">
                  <strong>Resource Requirements:</strong> This analysis is computationally intensive and 
                  may require significant processing time for large datasets.
                </Typography>
              </Alert>
            </Stack>
          </AccordionDetails>
        </Accordion>

        {/* Troubleshooting */}
        <Accordion expanded={expanded === 'troubleshooting'} onChange={handleChange('troubleshooting')}>
          <AccordionSummary expandIcon={<ExpandMore />}>
            <Box sx={{ display: 'flex', alignItems: 'center', width: '100%' }}>
              <Settings sx={{ mr: 1, color: 'primary.main' }} />
              <Typography variant="h6">Troubleshooting & FAQ</Typography>
            </Box>
          </AccordionSummary>
          <AccordionDetails>
            <Stack spacing={3}>
              <Paper variant="outlined" sx={{ p: 2 }}>
                <Typography variant="h6" gutterBottom color="error">
                  ⚠️ Common Issues
                </Typography>
                <List>
                  <ListItem>
                    <ListItemText 
                      primary="Out of Memory Errors" 
                      secondary="Reduce dataset size or increase system RAM. Consider subsampling large datasets."
                    />
                  </ListItem>
                  <ListItem>
                    <ListItemText 
                      primary="File Format Not Recognized" 
                      secondary="Ensure files are in supported formats (.h5ad, .h5, .hdf5). Check file integrity."
                    />
                  </ListItem>
                  <ListItem>
                    <ListItemText 
                      primary="Analysis Hangs or Crashes" 
                      secondary="Check system resources. Large datasets may require extended processing time."
                    />
                  </ListItem>
                  <ListItem>
                    <ListItemText 
                      primary="Poor Annotation Results" 
                      secondary="Verify data quality and try different reference databases. Manual curation may be needed."
                    />
                  </ListItem>
                </List>
              </Paper>

              <Paper variant="outlined" sx={{ p: 2 }}>
                <Typography variant="h6" gutterBottom color="primary">
                  💡 Best Practices
                </Typography>
                <List dense>
                  <ListItem>
                    <ListItemIcon><Info color="primary" /></ListItemIcon>
                    <ListItemText primary="Start with smaller datasets to familiarize yourself with the workflow" />
                  </ListItem>
                  <ListItem>
                    <ListItemIcon><Info color="primary" /></ListItemIcon>
                    <ListItemText primary="Ensure adequate disk space for intermediate and output files" />
                  </ListItem>
                  <ListItem>
                    <ListItemIcon><Info color="primary" /></ListItemIcon>
                    <ListItemText primary="Save intermediate results to avoid re-running long analyses" />
                  </ListItem>
                  <ListItem>
                    <ListItemIcon><Info color="primary" /></ListItemIcon>
                    <ListItemText primary="Validate results with known biological expectations" />
                  </ListItem>
                </List>
              </Paper>
            </Stack>
          </AccordionDetails>
        </Accordion>

      </Stack>

      {/* Footer */}
      <Box sx={{ textAlign: 'center', mt: 4, pt: 3, borderTop: 1, borderColor: 'divider' }}>
        <Typography variant="body2" color="text.secondary">
          Need more help? Check our GitHub repository or contact the development team.
        </Typography>
      </Box>
    </Box>
  );
}