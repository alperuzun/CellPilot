import React, { useState } from 'react';
import {
  Box, Paper, Typography, TextField, Button, Divider,
  Checkbox, FormControlLabel, FormControl, InputLabel, Select, MenuItem,
  IconButton, InputAdornment
} from '@mui/material';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import Grid from "@mui/material/Grid";
import FolderOpenIcon from '@mui/icons-material/FolderOpen';

interface Props {
  summary: any;
  onComplete?: (output: any) => void;
  setOutputs?: (outputs: any[]) => void;
  outputs?: any[];
  viewInput?: boolean;
  setViewInput?: (v: boolean) => void;
}

export default function AnnotationOptions({ summary, onComplete, setOutputs, outputs = [], viewInput, setViewInput }: Props) {
  const [loading, setLoading] = useState(false);
  const [state, set] = useState({
    input: summary ? summary['path'] : '',
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
    sca: false
  });
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
        output_dir:     state.output || `${window.process?.cwd?.() ?? ''}/output` ,
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
        use_cancer_single_cell_atlas: state.sca
      };

      const r = await fetch('http://127.0.0.1:8000/annotate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });

      const data = await r.json();
      if (!r.ok) throw new Error(data.detail || 'Annotation failed');

      if (onComplete) onComplete(data);
      alert('Annotation completed successfully');
      if (setOutputs) setOutputs([...outputs, { id: Date.now(), name: state.name, data }]);
      if (setViewInput) setViewInput(false);
    } catch (err:any) {
      console.error(err);
      alert(err.message || 'Annotation failed');
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
    <Paper variant="outlined" sx={{ p: 1, height: 'auto', minHeight: 'min-content', display: 'flex', flexDirection: 'column' }}>
      <Typography variant="subtitle1" gutterBottom>Input / Output</Typography>
      <Grid container spacing={1}>
        <Grid size={{xs:12, md:6}}>
          <TextField label="Input file" value={state.input} onChange={on('input')} fullWidth size="small" />
        </Grid>
        <Grid size={{xs:12, md:6}}>
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
        <Grid size={{xs:12, md:4}}>
          <TextField label="Run name" value={state.name} onChange={on('name')} fullWidth size="small" />
        </Grid>
      </Grid>

      <FormControlLabel
        control={<Checkbox checked={state.preprocessed} onChange={on('preprocessed')} />}
        label="File is already preprocessed"
      />

      {!state.preprocessed && (
        <>
          <Typography variant="subtitle1" sx={{ mt: 2 }}>Pre-processing</Typography>
          <Grid container spacing={1}>
            <Grid size={{xs:4, md:2}}><TextField label="Mito thr." type="number" size="small" value={state.mito}   onChange={on('mito')}  fullWidth /></Grid>
            <Grid size={{xs:4, md:2}}><TextField label="Min genes" type="number" size="small" value={state.minGenes} onChange={on('minGenes')} fullWidth /></Grid>
            <Grid size={{xs:4, md:2}}><TextField label="Min counts" type="number" size="small" value={state.minCounts} onChange={on('minCounts')} fullWidth /></Grid>
            <Grid size={{xs:4, md:2}}><TextField label="# HVGs"    type="number" size="small" value={state.hvgs}     onChange={on('hvgs')} fullWidth /></Grid>
            <Grid size={{xs:4, md:2}}><TextField label="# PCs"     type="number" size="small" value={state.pcs}      onChange={on('pcs')} fullWidth /></Grid>
            <Grid size={{xs:4, md:2}}><TextField label="# Neighbours" type="number" size="small" value={state.neigh} onChange={on('neigh')} fullWidth /></Grid>
            <Grid size={{xs:4, md:2}}><TextField label="Resolution"  type="number" size="small" value={state.res}   onChange={on('res')}  fullWidth /></Grid>
          </Grid>
        </>
      )}

      <Typography variant="subtitle1">Annotation settings</Typography>
      <Grid container spacing={2} alignItems="center">
        <Grid size={{xs:12, md:4}}>
          <FormControl fullWidth size="small">
            <InputLabel>Species</InputLabel>
            <Select label="Species" value={state.species} onChange={on('species')}>
              <MenuItem value="human">Human</MenuItem>
              <MenuItem value="mouse">Mouse</MenuItem>
            </Select>
          </FormControl>
        </Grid>
        <Grid size={{xs:12, md:8}}>
          <FormControlLabel control={<Checkbox checked={state.cm} onChange={on('cm')} />}  label="CellMarker" />
          <FormControlLabel control={<Checkbox checked={state.pl} onChange={on('pl')} />}  label="PanglaoDB"  />
          <FormControlLabel control={<Checkbox checked={state.sca} onChange={on('sca')} />} label="Cancer SCA" />
        </Grid>
      </Grid>

      <Box sx={{ mt: 3}}>
        <Button variant="contained" startIcon={<UploadFileIcon />} disabled={loading} onClick={runAnnotation}>
          {loading? 'Running…':'Run Annotation'}
        </Button>
      </Box>
    </Paper>
  );
}