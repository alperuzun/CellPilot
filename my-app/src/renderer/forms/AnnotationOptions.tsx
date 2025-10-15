import React, { useState, Dispatch, SetStateAction } from 'react';
import {
  Box, Paper, Typography, TextField, Button, Divider,
  Checkbox, FormControlLabel, FormControl, InputLabel, Select, MenuItem,
  IconButton, InputAdornment, Collapse
} from '@mui/material';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import Grid from "@mui/material/Grid";
import FolderOpenIcon from '@mui/icons-material/FolderOpen';
import ManualAnnotationUpload from '../components/ManualAnnotationUpload';

export interface Props {
  upload: any;
  setUpload: (upload: any) => void;
  onComplete?: (output: any) => void;
  setOutputs?: Dispatch<SetStateAction<any[]>>;
  outputs?: any[];
  viewInput?: boolean;
  setViewInput?: (v: boolean) => void;
  setUploads?: Dispatch<SetStateAction<any[]>>;
  uploads?: any[];
}

export const handleUploadClick = async (uploads: any[], setViewInput: (v: boolean) => void, setUploads: Dispatch<SetStateAction<any[]>>, setUpload: (upload: any) => void, set: (state: any) => void, state: any) => {
    const fullPath = await window.backend.openAdataFile();   // single dialog
    if (!fullPath) return;                                   // user cancelled

    set({...state, input: fullPath});
    const fileName = fullPath.split('/').pop();
    if (uploads.some(u => u.name === fileName)) {
      setUpload(uploads.find(u => u.name === fileName));
      setViewInput?.(true);
      return;
    }

    try {
      const r = await fetch('http://127.0.0.1:8000/adata_upload', {
        method : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body   : JSON.stringify({ input_path: fullPath, name: fileName })
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.detail ?? 'Upload failed');
      const newUpload = { id: Math.random(), name: fileName, summary: data.summary, outputs: [] };
      setUploads(prev => [newUpload, ...prev]);
      setUpload(newUpload);
    } catch (err:any) {
      console.error(err);
      alert(err.message);
    }
  };

export default function AnnotationOptions({ upload, setUpload, onComplete, setOutputs, outputs = [], viewInput, setViewInput, setUploads, uploads }: Props) {
  const [loading, setLoading] = useState(false);
  const [state, set] = useState({
    input: upload ? upload.summary.path : '',
    output: '',
    name: '',
    preprocessed: false,
    mito: 0.05,
    minGenes: 250,
    minCounts: 500,
    hvgs: 2000,
    pcs: 50,
    neigh: 15,
    res: 0.8,
    species: 'human',
    cm: true,
    pl: false,
    sca: false,
    useManualAnnotation: false,
    manualMarkerFile: null as string | null
  });
  const summary = upload?.summary;
  const on = (k: keyof typeof state) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement> | any) =>
      set({ ...state, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });

  /* ─────────── handlers ─────────── */
  const runAnnotation = async () => {
    try {
      setLoading(true);
      const body = {
        name:           state.name || 'run_'+Date.now(),
        input_path:     state.input,
        output_dir:     state.output,
        preprocessed:   state.preprocessed,
        preprocessing_params: {
          mito_prefix:     'MT-',
          mito_threshold:  state.mito,
          min_genes:       state.minGenes,
          min_counts:      state.minCounts,
          n_hvgs:          state.hvgs,
          n_pcs:           state.pcs,
          n_neighbors:     state.neigh,
          resolution:      state.res,
        },
        use_cellmarker: state.cm,
        use_panglao:    state.pl,
        use_cancer_single_cell_atlas: state.sca,
        use_manual_annotation: state.useManualAnnotation,
        manual_marker_file: state.manualMarkerFile
      };

      const r = await fetch('http://127.0.0.1:8000/annotate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });

      const data = await r.json();
      if (!r.ok) throw new Error(data.detail || 'Annotation failed');

      alert('Annotation completed successfully');
      console.log(data);
      const newOutput = { id: Date.now(), name: state.name, data: data, input: summary.path };
      if (setOutputs) setOutputs(prev => [...prev, newOutput]);
      if (onComplete) onComplete(newOutput);
      const enrichedUpload = { ...upload, outputs: [...upload.outputs, newOutput] };
      if (setUploads) setUploads(prev =>
        prev.map((u) => (u.id === enrichedUpload.id ? enrichedUpload : u))
      );
      if (setViewInput) setViewInput(false);
    } catch (err:any) {
      console.error(err);
      // Show more detailed error information
      let errorMessage = 'Annotation failed';
      if (err.message) {
        if (err.message.includes('No such file or directory')) {
          errorMessage = 'File not found. Please check the input file path and try again.';
        } else if (err.message.includes('FileNotFoundError')) {
          errorMessage = 'Input file could not be found. Please re-upload your data file.';
        } else {
          errorMessage = err.message;
        }
      }
      alert(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  /* ─────────── browse for output dir ─────────── */
  const pickOutputDir = async () => {
    const dir: string | undefined = await window.backend?.openDir?.();
    if (dir) set({ ...state, output: dir });
  };

  return (
    <Paper variant="outlined" sx={{ p: 1.5, height: 'auto', minHeight: 'min-content', display: 'flex', flexDirection: 'column' }}>
      <Typography variant="body1" sx={{ fontWeight: 'medium', mb: 1 }}>Input / Output</Typography>
      <Grid container spacing={1}>
        <Grid item xs={12} md={6}>
          <TextField label="Input file" value={state.input} onChange={on('input')} fullWidth size="small" InputProps={{
              readOnly: true,
              endAdornment: (
                <InputAdornment position="end">
                  <IconButton onClick={() => handleUploadClick(uploads, setViewInput, setUploads, setUpload, set, state)} edge="end">
                    <FolderOpenIcon />
                  </IconButton>
                </InputAdornment>
              ),
            }}/>
        </Grid>
        <Grid item xs={12} md={6}>
          <TextField
            label="Output directory"
            value={state.output}
            fullWidth
            size="small"
            InputProps={{
              readOnly: true,
              endAdornment: (
                <InputAdornment position="end">
                  <IconButton onClick={pickOutputDir} edge="end">
                    <FolderOpenIcon />
                  </IconButton>
                </InputAdornment>
              ),
            }}
          />
        </Grid>
        <Grid item xs={12} md={4}>
          <TextField label="Run name" value={state.name} onChange={on('name')} fullWidth size="small" />
        </Grid>
      </Grid>

      <FormControlLabel
        control={<Checkbox checked={state.preprocessed} onChange={on('preprocessed')} />}
        label="File is already preprocessed"
      />

      {!state.preprocessed && (
        <>
          <Typography variant="body1" sx={{ fontWeight: 'medium', mt: 1.5, mb: 1 }}>Pre-processing</Typography>
          <Grid container spacing={1}>
            <Grid item xs={4} md={2}><TextField label="Mito thr." type="number" size="small" value={state.mito}   onChange={on('mito')}  fullWidth /></Grid>
            <Grid item xs={4} md={2}><TextField label="Min genes" type="number" size="small" value={state.minGenes} onChange={on('minGenes')} fullWidth /></Grid>
            <Grid item xs={4} md={2}><TextField label="Min counts" type="number" size="small" value={state.minCounts} onChange={on('minCounts')} fullWidth /></Grid>
            <Grid item xs={4} md={2}><TextField label="# HVGs"    type="number" size="small" value={state.hvgs}     onChange={on('hvgs')} fullWidth /></Grid>
            <Grid item xs={4} md={2}><TextField label="# PCs"     type="number" size="small" value={state.pcs}      onChange={on('pcs')} fullWidth /></Grid>
            <Grid item xs={4} md={2}><TextField label="# Neighbours" type="number" size="small" value={state.neigh} onChange={on('neigh')} fullWidth /></Grid>
            <Grid item xs={4} md={2}><TextField label="Resolution"  type="number" size="small" value={state.res}   onChange={on('res')}  fullWidth /></Grid>
          </Grid>
        </>
      )}

      <Typography variant="body1" sx={{ fontWeight: 'medium', mb: 1, mt: 1.5 }}>Annotation settings</Typography>
      <Grid container spacing={1} alignItems="center">
        <Grid item xs={12} md={4}>
          <FormControl fullWidth size="small">
            <InputLabel>Species</InputLabel>
            <Select label="Species" value={state.species} onChange={on('species')}>
              <MenuItem value="human">Human</MenuItem>
              <MenuItem value="mouse">Mouse</MenuItem>
            </Select>
          </FormControl>
        </Grid>
        <Grid item xs={12}>
          <Typography variant="body2" sx={{ fontWeight: 'medium', mb: 0.5 }}>Reference Databases:</Typography>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
            <FormControlLabel control={<Checkbox checked={state.cm} onChange={on('cm')} />}  label="CellMarker" />
            <FormControlLabel control={<Checkbox checked={state.pl} onChange={on('pl')} />}  label="PanglaoDB"  />
            <FormControlLabel control={<Checkbox checked={state.sca} onChange={on('sca')} />} label="Cancer SCA" />
          </Box>
        </Grid>
        <Grid item xs={12}>
          <FormControlLabel 
            control={
              <Checkbox 
                checked={state.useManualAnnotation} 
                onChange={on('useManualAnnotation')} 
              />
            } 
            label="Use Manual Annotation with Custom Marker Genes" 
          />
        </Grid>
      </Grid>

      {/* Manual Annotation Section */}
      <Collapse in={state.useManualAnnotation}>
        <ManualAnnotationUpload
          onFileSelect={(filePath) => set({ ...state, manualMarkerFile: filePath })}
          selectedFile={state.manualMarkerFile}
          onClearFile={() => set({ ...state, manualMarkerFile: null })}
        />
      </Collapse>

      <Box sx={{ mt: 2}}>
        <Button variant="contained" startIcon={<UploadFileIcon />} disabled={loading} onClick={runAnnotation}>
          {loading? 'Running…':'Run Annotation'}
        </Button>
      </Box>
    </Paper>
  );
}