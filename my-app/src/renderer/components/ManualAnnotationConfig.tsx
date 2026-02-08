import React from 'react';
import { Box, Typography, Button, TextField, ToggleButton, ToggleButtonGroup, Collapse, FormControlLabel, Checkbox } from '@mui/material';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import TextFieldsIcon from '@mui/icons-material/TextFields';
import DeleteIcon from '@mui/icons-material/Delete';

interface ManualAnnotationConfigProps {
  useManualAnnotation: boolean;
  onToggle: (checked: boolean) => void;
  markerFile: string | null;
  onFileSelect: (path: string) => void;
  onClearFile: () => void;
  markerText: string;
  onTextChange: (text: string) => void;
  inputType: 'file' | 'text';
  onInputTypeChange: (type: 'file' | 'text') => void;
}

export default function ManualAnnotationConfig({
  useManualAnnotation,
  onToggle,
  markerFile,
  onFileSelect,
  onClearFile,
  markerText,
  onTextChange,
  inputType,
  onInputTypeChange
}: ManualAnnotationConfigProps) {

  const handleFileClick = async () => {
    try {
      // Use existing backend method if available, or just generic file picker
      const filePath = await window.backend?.openFile?.();
      if (filePath) {
        onFileSelect(filePath);
      }
    } catch (e) {
      console.error("File selection failed", e);
    }
  };

  return (
    <Box sx={{ mt: 2, p: 2, border: '1px solid', borderColor: 'divider', borderRadius: 1 }}>
      <FormControlLabel
        control={
          <Checkbox
            checked={useManualAnnotation}
            onChange={(e) => onToggle(e.target.checked)}
          />
        }
        label={
          <Typography variant="subtitle2" sx={{ fontWeight: 'medium' }}>
            Use Manual Annotation with Custom Marker Genes
          </Typography>
        }
      />

      <Collapse in={useManualAnnotation}>
        <Box sx={{ mt: 2, pl: 2 }}>
          <ToggleButtonGroup
            value={inputType}
            exclusive
            onChange={(_, newType) => {
              if (newType) onInputTypeChange(newType);
            }}
            size="small"
            sx={{ mb: 2 }}
          >
            <ToggleButton value="file">
              <UploadFileIcon fontSize="small" sx={{ mr: 1 }} />
              Upload File
            </ToggleButton>
            <ToggleButton value="text">
              <TextFieldsIcon fontSize="small" sx={{ mr: 1 }} />
              Enter Text
            </ToggleButton>
          </ToggleButtonGroup>

          {inputType === 'file' ? (
            <Box>
              <Typography variant="caption" display="block" color="text.secondary" gutterBottom>
                Upload a CSV or TXT file with columns: <code>cell_type, gene</code>
              </Typography>
              
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 1 }}>
                <Button
                  variant="outlined"
                  startIcon={<UploadFileIcon />}
                  onClick={handleFileClick}
                  size="small"
                >
                  Select Marker File
                </Button>
                {markerFile && (
                  <Box sx={{ display: 'flex', alignItems: 'center', bgcolor: 'action.hover', px: 1, py: 0.5, borderRadius: 1 }}>
                    <Typography variant="body2" noWrap sx={{ maxWidth: 200, mr: 1 }}>
                      {markerFile.split(/[/\\]/).pop()}
                    </Typography>
                    <DeleteIcon 
                      fontSize="small" 
                      color="action" 
                      sx={{ cursor: 'pointer', '&:hover': { color: 'error.main' } }}
                      onClick={onClearFile}
                    />
                  </Box>
                )}
              </Box>
            </Box>
          ) : (
            <Box>
              <Typography variant="caption" display="block" color="text.secondary" gutterBottom>
                Enter markers in CSV format (header optional): <code>cell_type, gene</code>
              </Typography>
              <TextField
                multiline
                rows={6}
                fullWidth
                placeholder={`T Cell, CD3D\nT Cell, CD3E\nB Cell, CD79A\n...`}
                value={markerText}
                onChange={(e) => onTextChange(e.target.value)}
                size="small"
                sx={{ 
                  mt: 1, 
                  fontFamily: 'monospace',
                  '& .MuiInputBase-input': { fontSize: '0.85rem', fontFamily: 'monospace' }
                }}
              />
            </Box>
          )}
        </Box>
      </Collapse>
    </Box>
  );
}

