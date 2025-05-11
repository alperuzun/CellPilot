import React from 'react';
import {
  Box, Chip, Typography, Table, TableHead, TableRow,
  TableCell, TableBody, Paper, Accordion, AccordionSummary,
  AccordionDetails, Stack, TableContainer,
  Divider,
  AppBar,
  Toolbar
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';

type Row = Record<string, any>;

function renderTable(rows: Row[]) {
  if (!rows.length) return null;
  const headers = Object.keys(rows[0]);

  return (
    <TableContainer
      component={Paper}
      variant="outlined"
      sx={{ width: '100%', overflowX: 'auto', mb: 2 }}
    >
      <Table size="small" sx={{ minWidth: 'max-content' }}>
        <TableHead>
          <TableRow>
            {headers.map(h => (
              <TableCell key={h} sx={{ fontWeight: 'bold' }}>{h}</TableCell>
            ))}
          </TableRow>
        </TableHead>
        <TableBody>
          {rows.map((r, i) => (
            <TableRow key={i}>
              {headers.map(h => (
                <TableCell key={h}>{String(r[h])}</TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
}

const HEADER = 56;      // or 56 for regular toolbar

export default function AdataSummaryPreview({ summary }: { summary: Row }) {
  const {
    path, n_obs, n_vars, preprocessed,
    obs_preview       = [] as Row[],
    var_preview       = [] as Row[],
    clusters          = [] as Row[],
    label_counts      = {} as any,
  } = summary;

  /* ---- normalise & sort cell-type counts (highest → lowest) ----------- */
  let sortedLabelCountsArray = {} as any;
  if (label_counts == null) {
    sortedLabelCountsArray = null;
  }
  else {
    const label_counts_keys = Object.keys(label_counts);
    for (const label of label_counts_keys) {
      const labelCountsArray: { label: string; count: number }[] =
      Array.isArray(label_counts)
        ? (label_counts as any)
        : Object.entries(label_counts[label]).map(([label, count]) => ({
            label,
            count: Number(count)
          }));

      const sortedLabelCounts = labelCountsArray.sort(
        (a, b) => b.count - a.count
      );
      sortedLabelCountsArray[label] = sortedLabelCounts;
    }
  }

  return (
    <Box sx={{ p: 0, width: '100%', height: '100%', overflowY: 'auto' }}>
      {/* —sticky header inside the preview— */}
      <Box
        sx={{
          position: 'sticky',
          top: 10,
          zIndex: 1,
          bgcolor: 'background.paper',
          borderBottom: 1,
          borderColor: 'divider',
          display: 'flex',
          alignItems: 'center',
          gap: 2,
          height: `${HEADER}px`,
          px: 2,
        }}
      >
        <Typography variant="h6" sx={{ flexShrink: 0 }}>
          {path?.split(/[\\/]/).pop()}
        </Typography>
        <Chip label={`${n_obs} cells`} color="primary" />
        <Chip label={`${n_vars} genes`} color="secondary" />
        <Chip
          label={preprocessed ? 'pre-processed' : 'raw'}
          color={preprocessed ? 'success' : 'warning'}
          variant={preprocessed ? 'filled' : 'outlined'}
        />
      </Box>

      {/* give the rest of the content room */}
      <Box sx={{ p: 2 }}>   {/* padding-top 2 so chips aren't glued to header */}
        {/* ─── unique cell types with counts ───────────────────────────── */}
        {sortedLabelCountsArray && Object.keys(sortedLabelCountsArray).length > 0 && (
          Object.keys(sortedLabelCountsArray).map((label: string, arr: any) => (
          <>
            <Typography variant="subtitle1" gutterBottom>Cell types by ({label})</Typography>
            <Stack direction="row" spacing={1} mb={2} flexWrap="wrap">
              {sortedLabelCountsArray[label].map(({ label, count }: any) => (
                <Chip
                  key={label}
                  label={`${label} (${count})`}
                  size="small"
                  variant="outlined"
                />
              ))}
            </Stack>
          </>
          
          ))
        )}

        {/* ─── clusters table ──────────────────────────────── */}
        {clusters.length > 0 && sortedLabelCountsArray.length == 0 && (
          <>
            <Typography variant="subtitle1" gutterBottom>Clusters</Typography>
            {renderTable(clusters)}
          </>
        )}

        <Typography variant="subtitle1" gutterBottom>Cells (obs) – first 5 rows</Typography>
        {renderTable(obs_preview)}

        <Accordion disableGutters>
          <AccordionSummary expandIcon={<ExpandMoreIcon />}>
            <Typography variant="subtitle1">Genes (var) – first 5 rows</Typography>
          </AccordionSummary>
          <AccordionDetails>
            {renderTable(var_preview)}
          </AccordionDetails>
        </Accordion>
      </Box>
    </Box>
  );
} 