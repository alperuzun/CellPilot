import React, { useState } from 'react';
import { Paper, Typography, Grid, TextField, Box, Button } from '@mui/material';
import ScienceIcon from '@mui/icons-material/Science';

export default function TumorPredictionOptions() {
  const [st, set] = useState({
    input:'', output:'', name:'', refKey:'', refCat:'', gtf:'db/gencode.v47.annotation.gtf.gz',
    cnv:0.03, cores:4
  });
  const on = (k: keyof typeof st)=>(e:any)=>set({...st,[k]:e.target.value});

  return (
    <Paper variant="outlined" sx={{ p: 3 }}>
      <Typography variant="h6" gutterBottom>Tumor Prediction</Typography>
      <Grid container spacing={2}>
        <Grid item xs={12} md={6}><TextField label="Input .h5ad" value={st.input}  onChange={on('input')} fullWidth size="small" /></Grid>
        <Grid item xs={12} md={6}><TextField label="Output directory" value={st.output} onChange={on('output')} fullWidth size="small" /></Grid>
        <Grid item xs={12} md={4}><TextField label="Run name" value={st.name} onChange={on('name')} fullWidth size="small" /></Grid>
        <Grid item xs={12} md={4}><TextField label="Reference key" value={st.refKey} onChange={on('refKey')} fullWidth size="small" /></Grid>
        <Grid item xs={12} md={4}><TextField label="Reference categories" value={st.refCat} onChange={on('refCat')} fullWidth size="small" /></Grid>
        <Grid item xs={12} md={6}><TextField label="GTF path" value={st.gtf} onChange={on('gtf')} fullWidth size="small" /></Grid>
        <Grid item xs={6}  md={3}><TextField label="CNV threshold" type="number" value={st.cnv}   onChange={on('cnv')} fullWidth size="small" /></Grid>
        <Grid item xs={6}  md={3}><TextField label="CPU cores" type="number" value={st.cores} onChange={on('cores')} fullWidth size="small" /></Grid>
      </Grid>

      <Box sx={{ mt: 3 }}>
        <Button variant="contained" startIcon={<ScienceIcon />}>
          Run Prediction
        </Button>
      </Box>
    </Paper>
  );
} 