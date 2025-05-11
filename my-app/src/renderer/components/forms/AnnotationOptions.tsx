import React, { useState } from 'react';
import {
  Box, Paper, Typography, Grid, TextField, Button, Divider,
  Checkbox, FormControlLabel, FormControl, InputLabel, Select, MenuItem
} from '@mui/material';
import UploadFileIcon from '@mui/icons-material/UploadFile';

export default function AnnotationOptions() {
  const [state, set] = useState({
    input: '',
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

  return (
    <Paper variant="outlined" sx={{ p: 3 }}>
      <Typography variant="h6" gutterBottom>Input / Output</Typography>
      <Grid container spacing={2}>
        <Grid item xs={12} md={6}>
          <TextField label="Input file" value={state.input} onChange={on('input')} fullWidth size="small" />
        </Grid>
        <Grid item xs={12} md={6}>
          <TextField label="Output directory" value={state.output} onChange={on('output')} fullWidth size="small" />
        </Grid>
        <Grid item xs={12} md={4}>
          <TextField label="Run name" value={state.name} onChange={on('name')} fullWidth size="small" />
        </Grid>
      </Grid>

      <Divider sx={{ my: 3 }} />

      <FormControlLabel
        control={<Checkbox checked={state.preprocessed} onChange={on('preprocessed')} />}
        label="File is already preprocessed"
      />

      {!state.preprocessed && (
        <>
          <Typography variant="subtitle1" sx={{ mt: 2 }}>Pre-processing</Typography>
          <Grid container spacing={2}>
            <Grid item xs={6} md={3}><TextField label="Mito thr." type="number" size="small" value={state.mito}   onChange={on('mito')}  fullWidth /></Grid>
            <Grid item xs={6} md={3}><TextField label="Min genes" type="number" size="small" value={state.minGenes} onChange={on('minGenes')} fullWidth /></Grid>
            <Grid item xs={6} md={3}><TextField label="Min counts" type="number" size="small" value={state.minCounts} onChange={on('minCounts')} fullWidth /></Grid>
            <Grid item xs={6} md={3}><TextField label="# HVGs"    type="number" size="small" value={state.hvgs}     onChange={on('hvgs')} fullWidth /></Grid>
            <Grid item xs={6} md={3}><TextField label="# PCs"     type="number" size="small" value={state.pcs}      onChange={on('pcs')} fullWidth /></Grid>
            <Grid item xs={6} md={3}><TextField label="# Neighbours" type="number" size="small" value={state.neigh} onChange={on('neigh')} fullWidth /></Grid>
            <Grid item xs={6} md={3}><TextField label="Resolution"  type="number" size="small" value={state.res}   onChange={on('res')}  fullWidth /></Grid>
          </Grid>
        </>
      )}

      <Divider sx={{ my: 3 }} />

      <Typography variant="subtitle1">Annotation settings</Typography>
      <Grid container spacing={2} alignItems="center">
        <Grid item xs={12} md={4}>
          <FormControl fullWidth size="small">
            <InputLabel>Species</InputLabel>
            <Select label="Species" value={state.species} onChange={on('species')}>
              <MenuItem value="human">Human</MenuItem>
              <MenuItem value="mouse">Mouse</MenuItem>
            </Select>
          </FormControl>
        </Grid>
        <Grid item xs={12} md={8}>
          <FormControlLabel control={<Checkbox checked={state.cm} onChange={on('cm')} />}  label="CellMarker" />
          <FormControlLabel control={<Checkbox checked={state.pl} onChange={on('pl')} />}  label="PanglaoDB"  />
          <FormControlLabel control={<Checkbox checked={state.sca} onChange={on('sca')} />} label="Cancer SCA" />
        </Grid>
      </Grid>

      <Box sx={{ mt: 3 }}>
        <Button variant="contained" startIcon={<UploadFileIcon />}>Run Annotation</Button>
      </Box>
    </Paper>
  );
} 