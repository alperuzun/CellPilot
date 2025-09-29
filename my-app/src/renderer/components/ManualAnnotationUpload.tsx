import React, { useState } from 'react';
import {
  Box,
  Paper,
  Typography,
  Button,
  IconButton,
  Alert,
  Chip,
  Stack,
  Divider,
  List,
  ListItem,
  ListItemText,
  ListItemIcon,
  Collapse
} from '@mui/material';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import ClearIcon from '@mui/icons-material/Clear';
import HelpIcon from '@mui/icons-material/Help';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';

interface ManualAnnotationUploadProps {
  onFileSelect: (filePath: string) => void;
  selectedFile: string | null;
  onClearFile: () => void;
}

export default function ManualAnnotationUpload({
  onFileSelect,
  selectedFile,
  onClearFile
}: ManualAnnotationUploadProps) {
  const [showHelp, setShowHelp] = useState(false);

  const handleFileUpload = async () => {
    try {
      const filePath = await window.backend.openMarkerFile();
      if (filePath) {
        onFileSelect(filePath);
      }
    } catch (error) {
      console.error('Error uploading marker file:', error);
      alert('Failed to upload marker file. Please try again.');
    }
  };

  const fileName = selectedFile ? selectedFile.split('/').pop() : null;

  return (
    <Paper variant="outlined" sx={{ p: 2, mt: 1.5 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', mb: 1.5 }}>
        <Typography variant="subtitle1" color="primary" sx={{ fontSize: '1rem' }}>
          Manual Annotation with Custom Marker Genes
        </Typography>
        <IconButton
          size="small"
          onClick={() => setShowHelp(!showHelp)}
          sx={{ ml: 'auto' }}
        >
          <HelpIcon />
        </IconButton>
      </Box>

      <Collapse in={showHelp}>
        <Alert severity="info" sx={{ mb: 1.5, py: 1 }}>
          <Typography variant="body2" sx={{ mb: 1 }}>
            <strong>Upload a custom marker gene file to annotate your cells:</strong>
          </Typography>
          <Typography variant="body2" sx={{ mb: 1 }}>
            Your file should be in CSV/TSV format with columns:
          </Typography>
          <Stack direction="row" spacing={1} sx={{ mb: 1 }}>
            <Chip label="cell_type" size="small" variant="outlined" />
            <Chip label="gene" size="small" variant="outlined" />
          </Stack>
          <Typography variant="body2" sx={{ mt: 1 }}>
            Example: T cell, CD3D | B cell, CD19 | Macrophage, CD68
          </Typography>
        </Alert>
      </Collapse>

      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
        {!selectedFile ? (
          <Box>
            <Button
              variant="outlined"
              startIcon={<UploadFileIcon />}
              onClick={handleFileUpload}
              size="medium"
              sx={{ 
                minHeight: 48,
                borderStyle: 'dashed',
                borderWidth: 2,
                width: '100%',
                '&:hover': {
                  borderStyle: 'dashed',
                  borderWidth: 2,
                }
              }}
            >
              Upload Marker Gene File (.csv, .tsv, .txt)
            </Button>
          </Box>
        ) : (
          <Box>
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                p: 2,
                bgcolor: 'success.50',
                border: 1,
                borderColor: 'success.200',
                borderRadius: 1,
                mb: 1.5
              }}
            >
              <CheckCircleIcon sx={{ color: 'success.main', mr: 1 }} />
              <Box sx={{ flexGrow: 1 }}>
                <Typography variant="body1" fontWeight="medium">
                  {fileName}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Custom marker file loaded
                </Typography>
              </Box>
              <IconButton 
                onClick={onClearFile}
                size="small"
                sx={{ color: 'text.secondary' }}
              >
                <ClearIcon />
              </IconButton>
            </Box>
          </Box>
        )}

        <Divider />

        <Box>
          <Typography variant="body2" sx={{ fontWeight: 'medium', mb: 0.5 }}>
            Supported File Formats:
          </Typography>
          <List dense>
            <ListItem>
              <ListItemIcon>
                <CheckCircleIcon fontSize="small" color="success" />
              </ListItemIcon>
              <ListItemText
                primary="CSV files (.csv)"
                secondary="Comma-separated values with headers"
              />
            </ListItem>
            <ListItem>
              <ListItemIcon>
                <CheckCircleIcon fontSize="small" color="success" />
              </ListItemIcon>
              <ListItemText
                primary="TSV files (.tsv, .txt)"
                secondary="Tab-separated values with headers"
              />
            </ListItem>
          </List>
        </Box>

        <Alert severity="warning" sx={{ mt: 1, py: 1 }}>
          <Typography variant="body2">
            <strong>Note:</strong> Manual annotation will be used in addition to selected 
            reference databases. Ensure your marker genes use the same gene symbols as your data.
          </Typography>
        </Alert>
      </Box>
    </Paper>
  );
}