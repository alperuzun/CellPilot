import React, { useState } from 'react';
import { Paper, Typography, Grid, TextField, Box, Button } from '@mui/material';
import ConnectWithoutContactIcon from '@mui/icons-material/ConnectWithoutContact';

export default function CellInteractionOptions() {
  const [st, set] = useState({
    input: '', output: '', column: 'cell_type', db: 'db/cellphonedb.zip',
    name: '', counts: 10, detailed: 'All'
  });
  const on = (k: keyof typeof st) =>
    (e: any) => set({ ...st, [k]: e.target.value });

  return (
    <Paper variant="outlined" sx={{ p: 3 }}>
      <Typography variant="h6" gutterBottom>CellPhoneDB / Cell-interaction</Typography>
      <Grid container spacing={2}>
        <Grid item xs={12} md={6}><TextField label="Input .h5ad" value={st.input}   onChange={on('input')} fullWidth size="small" /></Grid>
        <Grid item xs={12} md={6}><TextField label="Output directory" value={st.output} onChange={on('output')} fullWidth size="small" /></Grid>
        <Grid item xs={12} md={4}><TextField label="Label column" value={st.column} onChange={on('column')} fullWidth size="small" /></Grid>
        <Grid item xs={12} md={4}><TextField label="DB (zip)" value={st.db} onChange={on('db')} fullWidth size="small" /></Grid>
        <Grid item xs={12} md={4}><TextField label="Run name" value={st.name} onChange={on('name')} fullWidth size="small" /></Grid>
        <Grid item xs={6}  md={3}><TextField label="Counts ≥" type="number" value={st.counts} onChange={on('counts')} fullWidth size="small" /></Grid>
        <Grid item xs={6}  md={9}><TextField label="Detailed plots (comma / All / none)" value={st.detailed} onChange={on('detailed')} fullWidth size="small" /></Grid>
      </Grid>

      <Box sx={{ mt: 3 }}>
        <Button variant="contained" startIcon={<ConnectWithoutContactIcon />}>
          Run CellPhoneDB
        </Button>
      </Box>
    </Paper>
  );
} 