import React, { useState, useMemo } from 'react';
import {
  Paper, Typography, Grid, TextField, Box, Button, MenuItem,
  FormControl, Select, InputLabel, ListItemText, List, IconButton,
  InputAdornment, Checkbox, Collapse, Divider, ListItemIcon, CircularProgress
} from '@mui/material';
import ConnectWithoutContactIcon from '@mui/icons-material/ConnectWithoutContact';
import FolderOpenIcon from '@mui/icons-material/FolderOpen';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';

export default function CellInteractionOptions({
  summary, onComplete, setOutputs, outputs, viewInput, setViewInput,
}: {
  summary: any; onComplete: (output: any) => void;
  setOutputs: (outputs: any[]) => void; outputs: any[]; viewInput: boolean; setViewInput: (v: boolean) => void;
}) {

  /* ----------------------- form state --------------------------------- */
  const [st, set] = useState({
    input:   summary ? summary['path'] : '',
    output:  '',
    column:  'cell_type',
    db:      'db/cellphonedb.zip',
    name:    '',
    counts:  10,
  });

  /* detailed plot cell-types (encoded as "category::label") */
  const [selectedCellTypes, setSelectedCellTypes] = useState<string[]>([]);
  const [loading, setLoading]   = useState(false);

  /* helper: update single field */
  const on = (k: keyof typeof st) =>
    (e: React.ChangeEvent<HTMLInputElement>) =>
      set({ ...st, [k]: e.target.value });

  /* ----------------------- action ------------------------------------- */
  const runCellPhoneDB = async () => {
    setLoading(true);
    /* 1. convert the UI selections to the backend shape */
    const plot_column_names = selectedCellTypes.map(id => id.split('::')[1]);   // decode → raw labels

    const body = {
      /* names in the JSON you showed: */
      input_path: st.input,
      name:       st.name || `cpdb_${Date.now()}`,
      output_dir: st.output || `${window.process?.cwd?.() ?? ''}/output`,
      column_name:       st.column,
      cpdb_file_path:    st.db,
      plot_column_names,                      // [] → backend will treat as "all"
      counts_threshold:  Number(st.counts),   // optional extra if your API wants it
    };

    try {
      const r = await fetch('http://127.0.0.1:8000/cellphonedb', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.detail || 'CellPhoneDB failed');

      onComplete?.(data);
      alert('CellPhoneDB completed successfully');
      setViewInput?.(false);
      setOutputs([...outputs, { id: Date.now(), name: body.name, data }]);
    } catch (err: any) {
      console.error(err);
      alert(err.message || 'CellPhoneDB failed');
    } finally {
      setLoading(false);
    }
  };

  /* ----------------------- ui ---------------------------------------- */
  return (
    <Paper variant="outlined" sx={{ p: 3 }}>
      <Typography variant="h6" gutterBottom>
        CellPhoneDB / Cell-interaction
      </Typography>

      <Grid container spacing={2}>
        <Grid item xs={12} md={6}>
          <TextField label="Input .h5ad" value={st.input} onChange={on('input')} fullWidth size="small" />
        </Grid>

        <Grid item xs={12} md={6}>
          <TextField
            label="Output directory"
            value={st.output}
            fullWidth
            size="small"
            InputProps={{
              readOnly: true,
              endAdornment: (
                <InputAdornment position="end">
                  <IconButton onClick={async () => {
                    const dir = await window.backend?.openDir?.();
                    if (dir) set({ ...st, output: dir });
                  }}>
                    <FolderOpenIcon />
                  </IconButton>
                </InputAdornment>
              ),
            }}
          />
        </Grid>

        <Grid item xs={12} md={4}>
          <TextField label="Label column" value={st.column} onChange={on('column')} fullWidth size="small" />
        </Grid>

        <Grid item xs={12} md={4}>
          <TextField label="DB (zip)" value={st.db} onChange={on('db')} fullWidth size="small" />
        </Grid>

        <Grid item xs={12} md={4}>
          <TextField label="Run name" value={st.name} onChange={on('name')} fullWidth size="small" />
        </Grid>

        <Grid item xs={6} md={3}>
          <TextField label="Counts ≥" type="number" value={st.counts} onChange={on('counts')} fullWidth size="small" />
        </Grid>

        {/* detailed plot selector */}
        <Grid item xs={6} md={9}>
          <DetailedPlotsDropdown
            summary={summary}
            selectedCellTypes={selectedCellTypes}
            setSelectedCellTypes={setSelectedCellTypes}
          />
        </Grid>
      </Grid>

      {/* run button */}
      <Box sx={{ mt: 3 }}>
        <Button
          variant="contained"
          disabled={loading}
          startIcon={
            loading
              ? <CircularProgress size={18} color="inherit" />
              : <ConnectWithoutContactIcon />
          }
          onClick={runCellPhoneDB}
        >
          {loading ? 'Running…' : 'Run CellPhoneDB'}
        </Button>
      </Box>
    </Paper>
  );
}

import React, { useState } from 'react';
import {
  Box, Checkbox, Collapse, Divider, FormControl, InputLabel,
  ListItemIcon, ListItemText, MenuItem, Select
} from '@mui/material';
import ExpandLessIcon  from '@mui/icons-material/ExpandLess';
import ExpandMoreIcon  from '@mui/icons-material/ExpandMore';

type Props = {
  summary: any;
  selectedCellTypes: string[];                    // keeps encoded ids
  setSelectedCellTypes: (ids: string[]) => void;
};

function DetailedPlotsDropdown({
  summary, selectedCellTypes, setSelectedCellTypes
}: Props) {
  /* ---------- helpers --------------------------------------------------- */
  const encode = (cat: string, ct: string) => `${cat}::${ct}`;   // unique id
  const decode = (id: string)            => id.split('::')[1];   // raw label

  const categories: string[] = summary?.label_counts
    ? Object.keys(summary.label_counts)
    : [];

  const allIds: string[] = useMemo(
    () =>
      categories.flatMap(cat =>
        Object.keys(summary.label_counts[cat] || {}).map(ct => encode(cat, ct))
      ),
    [categories, summary]
  );

  /* ---------- local ui state -------------------------------------------- */
  const [expandedCat, setExpandedCat] = useState<string | null>(null);

  /* ---------- toggle helpers -------------------------------------------- */
  const toggleCategory = (cat: string) =>
    setExpandedCat(prev => (prev === cat ? null : cat));

  const toggleId = (id: string) => {
    setSelectedCellTypes(
      selectedCellTypes.includes(id)
        ? selectedCellTypes.filter(x => x !== id)
        : [...selectedCellTypes, id]
    );
  };

  const toggleWholeCategory = (cat: string) => {
    const catIds = Object.keys(summary.label_counts[cat] || {})
                    .map(ct => encode(cat, ct));

    const allSelected = catIds.every(id => selectedCellTypes.includes(id));

    setSelectedCellTypes(
      allSelected
        ? selectedCellTypes.filter(id => !catIds.includes(id))   // deselect all
        : [...selectedCellTypes, ...catIds.filter(id => !selectedCellTypes.includes(id))]
    );
  };

  const handlePreset = (preset: 'All' | 'None') =>
    setSelectedCellTypes(preset === 'All' ? allIds : []);

  /* ---------- label that appears in the Select input -------------------- */
  const renderValue = () => {
    if (selectedCellTypes.length === 0)                 return 'None';
    if (selectedCellTypes.length === allIds.length)     return 'All';
    return `${selectedCellTypes.length} selected`;
  };

  /* ---------- component -------------------------------------------------- */
  return (
    <FormControl fullWidth size="small" sx={{ width: '300px' }}>
      <InputLabel id="detailed-plots-label">Detailed plots</InputLabel>

      <Select
        labelId="detailed-plots-label"
        multiple
        value={selectedCellTypes}
        /* we handle all changes manually in the checkboxes */
        onChange={() => undefined}
        renderValue={renderValue}
        MenuProps={{ PaperProps: { style: { maxHeight: 400, width: 340 } } }}
        label="Detailed plots"
      >
        {/*  Presets  */}
        <MenuItem onClick={() => handlePreset('All')}>
          <ListItemIcon>
            <Checkbox
              edge="start"
              checked={selectedCellTypes.length === allIds.length}
              indeterminate={
                selectedCellTypes.length > 0 &&
                selectedCellTypes.length < allIds.length
              }
            />
          </ListItemIcon>
          <ListItemText primary="All cell types" />
        </MenuItem>

        <MenuItem onClick={() => handlePreset('None')}>
          <ListItemIcon>
            <Checkbox edge="start" checked={selectedCellTypes.length === 0} />
          </ListItemIcon>
          <ListItemText primary="None" />
        </MenuItem>

        <Divider sx={{ my: 0.5 }} />

        {/*  Categories & cell-types  */}
        {categories.map(cat => {
          const rawTypes = Object.keys(summary.label_counts[cat] || {});
          const catIds   = rawTypes.map(ct => encode(cat, ct));

          const allSel  = catIds.every(id => selectedCellTypes.includes(id));
          const someSel = catIds.some(id => selectedCellTypes.includes(id));

          return (
            <Box key={cat}>
              {/*  Category header  */}
              <MenuItem
                onClick={e => { e.stopPropagation(); toggleCategory(cat); }}
              >
                <ListItemIcon>
                  <Checkbox
                    edge="start"
                    checked={allSel}
                    indeterminate={!allSel && someSel}
                    onClick={e => { e.stopPropagation(); toggleWholeCategory(cat); }}
                  />
                </ListItemIcon>
                <ListItemText primary={cat} />
                {expandedCat === cat ? <ExpandLessIcon /> : <ExpandMoreIcon />}
              </MenuItem>

              {/*  Child cell-types  */}
              <Collapse in={expandedCat === cat} timeout="auto" unmountOnExit>
                {rawTypes.map(ct => {
                  const id = encode(cat, ct);
                  return (
                    <MenuItem
                      key={id}
                      sx={{ pl: 6 }}
                      onClick={e => { e.stopPropagation(); toggleId(id); }}
                    >
                      <ListItemIcon>
                        <Checkbox checked={selectedCellTypes.includes(id)} edge="start" />
                      </ListItemIcon>
                      <ListItemText primary={ct} />
                    </MenuItem>
                  );
                })}
              </Collapse>
            </Box>
          );
        })}
      </Select>
    </FormControl>
  );
}