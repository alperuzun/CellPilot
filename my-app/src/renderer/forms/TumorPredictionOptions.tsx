import React, { useState, useMemo } from 'react';
import {
  Paper, Typography, Grid, TextField, Box, Button,
  FormControl, InputLabel, Select, MenuItem,
  Checkbox, ListItemText, IconButton, InputAdornment,
  CircularProgress
} from '@mui/material';
import ScienceIcon from '@mui/icons-material/Science';
import FolderOpenIcon from '@mui/icons-material/FolderOpen';
import { Props as AnnotationOptionsProps, handleUploadClick } from './AnnotationOptions';


export default function TumorPredictionOptions({ upload, onComplete, setUploads, setUpload, viewInput, setViewInput, uploads }: AnnotationOptionsProps) {
  /* ─────────── summary-driven helpers ─────────── */
  const refKeys: string[] = useMemo(
    () => upload?.summary?.label_counts ? Object.keys(upload.summary.label_counts) : [],
    [upload]
  );

  const categoriesForKey = (key: string) =>
    key && upload?.summary?.label_counts?.[key]
      ? Object.keys(upload.summary.label_counts[key])
      : [];

  /* ─────────── form state ─────────── */
  const [st, set] = useState({
    input_path : upload ? upload.summary.path : '',
    output_dir: '',
    name  : '',
    reference_key: '',
    reference_cat: [] as string[],   // ← now an array
    gtf_path   : 'db/gencode.v47.annotation.gtf.gz',
    cnv_threshold   : 0.03,
    cores : 4
  });
  const [loading, setLoading] = useState(false);

  const runTumorPrediction = async () => {
    setLoading(true);
    try {
      console.log(st);
      const r = await fetch('http://127.0.0.1:8000/inferCNV', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(st)
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.detail || 'Tumor Prediction failed');
      alert('Tumor Prediction completed successfully');
      const newOutput = { id: Date.now(), name: st.name, data: data, input: upload?.summary.path };
      const enrichedUpload = { ...upload, outputs: [...upload.outputs, newOutput] };
      if (setUploads) setUploads(prev =>
        prev.map((u: any) => (u.id === enrichedUpload.id ? enrichedUpload : u))
      );
      setUpload(enrichedUpload);
      if (onComplete) onComplete(newOutput);
      setViewInput?.(false);
    } catch (err: any) {
      console.error(err);
      alert(err.message || 'Tumor Prediction failed');
    } finally {
      setLoading(false);
    }
  }

  const on  = (k: keyof typeof st) => (v: any) => set({ ...st, [k]: v });

  /* ─────────── handlers ─────────── */
  const handleRefKeyChange = (e: any) => {
    const key = e.target.value;
    set({ ...st, reference_key: key, reference_cat: [] });          // reset categories
  };

  const handleRefCatChange = (e: any) =>
    set({ ...st, reference_cat: e.target.value as string[] });

  /* ───────── browse for output dir ───────── */
  const pickOutputDir = async () => {
    const dir: string | undefined = await window.backend?.openDir?.();
    if (dir) set({ ...st, output_dir: dir });
  };

  /* ─────────── ui ─────────── */
  return (
    <Paper variant="outlined" sx={{ p: 3 }}>
      <Typography variant="h6" gutterBottom>Tumor Prediction & Drug Response</Typography>

      <Grid container spacing={2}>
        <Grid item xs={12} md={6}>
          <TextField
            label="Input .h5ad"
            value={st.input_path}
            onChange={e => on('input_path')(e.target.value)}
            fullWidth size="small" InputProps={{
              readOnly: true,
              endAdornment: (
                <InputAdornment position="end">
                  <IconButton onClick={() => handleUploadClick(uploads, setViewInput, setUploads, setUpload, set, st)} edge="end">
                    <FolderOpenIcon />
                  </IconButton>
                </InputAdornment>
              ),
            }}/>
        </Grid>
        <Grid item xs={12} md={6}>
          <TextField
            label="Output directory"
            value={st.output_dir}
            fullWidth
            size="small"
            InputProps={{
              readOnly: true,
              endAdornment: (
                <InputAdornment position="end">
                  <IconButton edge="end" onClick={pickOutputDir}>
                    <FolderOpenIcon />
                  </IconButton>
                </InputAdornment>
              ),
            }}
          />
        </Grid>

        {/* -------- reference key ---------- */}
        <Grid item xs={12} md={6}>
          <FormControl
            fullWidth
            size="small"
            sx={{ minWidth: 260 }}
          >
            <InputLabel id="ref-key-lbl">Reference key (optional)</InputLabel>
            <Select
              labelId="ref-key-lbl"
              label="Reference key"
              value={st.reference_key}
              onChange={handleRefKeyChange}
            >
              {refKeys.map(k => (
                <MenuItem key={k} value={k}>{k}</MenuItem>
              ))}
            </Select>
          </FormControl>
        </Grid>

        {/* -------- reference categories ---------- */}
        <Grid item xs={12} md={6}>
          <FormControl
            fullWidth
            size="small"
            disabled={!st.reference_key}
            sx={{ minWidth: 260 }}
          >
            <InputLabel id="ref-cat-lbl">Reference categories (optional)</InputLabel>
            <Select
              labelId="ref-cat-lbl"
              multiple
              label="Reference categories"
              value={st.reference_cat}
              onChange={handleRefCatChange}
              renderValue={(sel) => (sel as string[]).join(', ')}
            >
              {categoriesForKey(st.reference_key).map(cat => (
                <MenuItem key={`${st.reference_key}::${cat}`} value={cat}>
                  <Checkbox checked={st.reference_cat.includes(cat)} />
                  <ListItemText primary={cat} />
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </Grid>

        {/* any other fields that were already there */}
        <Grid item xs={12} md={4}>
          <TextField
            label="Run name"
            value={st.name}
            onChange={e => on('name')(e.target.value)}
            fullWidth size="small"
          />
        </Grid>
        <Grid item xs={12} md={6}>
          <TextField
            label="GTF path"
            value={st.gtf_path}
            onChange={e => on('gtf_path')(e.target.value)}
            fullWidth size="small"
          />
        </Grid>
        <Grid item xs={6} md={3}>
          <TextField
            label="CNV threshold"
            type="number"
            value={st.cnv_threshold}
            onChange={e => on('cnv_threshold')(Number(e.target.value))}
            fullWidth size="small"
          />
        </Grid>
        <Grid item xs={6} md={3}>
          <TextField
            label="CPU cores"
            type="number"
            value={st.cores}
            onChange={e => on('cores')(Number(e.target.value))}
            fullWidth size="small"
          />
        </Grid>
      </Grid>

      <Box sx={{ mt: 3 }}>
        <Button
          variant="contained"
          disabled={loading}
          startIcon={
            loading
              ? <CircularProgress size={18} color="inherit" />
              : <ScienceIcon />
          }
          onClick={runTumorPrediction}
        >
          {loading ? 'Running…' : 'Run Tumor Prediction'}
        </Button>
      </Box>
    </Paper>
  );
}