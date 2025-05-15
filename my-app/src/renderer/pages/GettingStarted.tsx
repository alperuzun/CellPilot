import React, { useState, useEffect } from 'react';
import { Box, Card, CardContent, Paper, Tabs, Tab, Typography, Switch, FormControlLabel, FormControl, InputLabel, Select, MenuItem, Button, Chip } from '@mui/material';
import { Insights, Source, Share, Science } from '@mui/icons-material';
import AnnotationOptions from '../forms/AnnotationOptions';
import CellInteractionOptions from '../forms/CellInteractionOptions';
import TumorPredictionOptions from '../forms/TumorPredictionOptions';
import AdataSummaryPreview from '../components/AdataSummaryPreview';
import AnnotationResultsDashBoard from '../components/AnnotationResultsDashBoard';
import { Upload, Output } from '../layouts/PrimaryLayout';
/* --------------------------- helper: tab panel -------------------------- */
interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}
function TabPanel({ children, value, index, ...other }: TabPanelProps) {
  return (
    <div
      role="tabpanel"
      hidden={value !== index}
      style={{ height: '100%', overflowY: 'auto' }}   // allow vertical scroll when space is tight
      {...other}
    >
      {value === index && <Box sx={{ p: 2 }}>{children}</Box>}
    </div>
  );
}

/* ------------------------------ main page ------------------------------ */
export default function GettingStarted({ upload, output, outputs, setOutput, setOutputs, viewInput, setViewInput, uploads, setUploads, setUpload }: { upload: Upload | null, output: Output | null, outputs: Output[], setOutput: (output: Output) => void, setOutputs: (outputs: Output[]) => void, viewInput: boolean, setViewInput: (viewInput: boolean) => void, uploads: Upload[], setUploads: (uploads: Upload[]) => void, setUpload: (upload: Upload) => void }) {
  const [tab, setTab] = useState(0);
  const [previewH, setPreviewH] = useState(0.55 * window.innerHeight);    
  const summary = upload?.summary;

  // reset the chosen result whenever we re-enter "input view" or pick another file
  useEffect(() => {
    if (viewInput) setOutput(null);   // nothing selected
  }, [upload, viewInput]);

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        flex: 1,        /* ← fill parent column-flex container */
        gap: 0,
        minHeight: 0,
        width: '100%',    /* enable the Paper section to flex & scroll */
      }}
    >
      {/* -------------------- preview (row-1) -------------------- */}
      <Card elevation={3} square sx={{ height: previewH, minHeight:200 }}>
        <CardContent
          sx={{
            height: '100%',
            p: 0,
            '&:last-child': { pb: 0 }   // kill the built-in bottom padding
          }}
        >
          <Box
            sx={{
              height: '100%',
              width:  '100%',            // stretch border to full width
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              bgcolor: 'grey.100',
              border: '1px dashed',
              borderColor: 'grey.400',
              position: 'relative'
            }}
          >
            {/* ── output selector ─────────────────────────────────────────*/}
            {viewInput && upload?.outputs?.length ? (
              <FormControl size="small" sx={{ position: 'absolute', top: 20, right: 20, zIndex: 1000, minWidth: 160 }}>
                <InputLabel id="output-select-label" sx={{ fontSize: '0.875rem' }}>View Outputs</InputLabel>
                <Select
                  labelId="output-select-label"
                  label="Output"
                  value={
                    output && upload.outputs.some((o: Output) => o.id === output.id) ? output.id : ''
                  }
                  onChange={(e) => {
                    const id = Number(e.target.value);
                    const sel = upload.outputs.find((o: Output) => o.id === id);
                    if (sel) {
                      setOutput(sel);
                      setViewInput(false);
                    }
                  }}
                >
                  {upload.outputs.map((o: Output) => (
                    <MenuItem key={o.id} sx={{ fontSize: '0.875rem' }} value={o.id}>{o.name}</MenuItem>
                  ))}
                </Select>
              </FormControl>
            ) : null}

            {viewInput ? (
              summary ? (
                <AdataSummaryPreview summary={summary} />   
              ) : (
                <Typography color="text.secondary">
                  (Preview of selected input / h5ad file)
                </Typography>
              )
            ) : (
              <AnnotationResultsDashBoard output={output} viewInput={viewInput} setViewInput={setViewInput} setUpload={setUpload} uploads={uploads} />
            )}
          </Box>
        </CardContent>
      </Card>

      {/* -------------------- Drag bar -------------------- */}
      <Box
        onMouseDown={(e) => {
          const startY = e.clientY;
          const startH = previewH;
          const onMove = (ev: MouseEvent) => setPreviewH(Math.max(200, startH + ev.clientY - startY));
          const onUp   = () => window.removeEventListener('mousemove', onMove);
          window.addEventListener('mousemove', onMove);
          window.addEventListener('mouseup', onUp, { once:true });
        }}
        sx={{
          height: 6,
          cursor: 'row-resize',
          bgcolor: 'grey.300',
          '&:hover': { bgcolor: 'grey.400' },
        }}
      />

      {/* -------------------- tabs (row-2) ---------------------- */}
      <Paper elevation={2} square sx={{ flex: 1, height: '100%', minHeight: 0 }}>
        <Box sx={{ display: 'flex', height: '100%' }}>
          {/* panels on the left (shrink / grow) */}
          <Box
            sx={{
              flex: 1,               // grow to fill
              minWidth: 0,           // allow it to become narrow
              /* Allow vertical scrolling of long forms but prevent horizontal overflow
                 so the right-hand tab rail stays fixed in view. */
              overflowY: 'auto',
              overflowX: 'hidden',
              height: '100%',
            }}
          >
            <TabPanel value={tab} index={0}>
              <AnnotationOptions key={summary?.path ?? 'ann'} upload={upload} setUpload={setUpload} onComplete={setOutput} setOutputs={setOutputs} outputs={outputs} viewInput={viewInput} setViewInput={setViewInput} setUploads={setUploads} uploads={uploads} />
            </TabPanel>
            <TabPanel value={tab} index={1}>
              <CellInteractionOptions key={summary?.path ?? 'ci'} upload={upload} setUpload={setUpload} onComplete={setOutput} outputs={outputs} setOutputs={setOutputs} viewInput={viewInput} setViewInput={setViewInput} setUploads={setUploads} uploads={uploads} />
            </TabPanel>
            <TabPanel value={tab} index={2}>
              <TumorPredictionOptions key={summary?.path ?? 'tp'} upload={upload} setUpload={setUpload} onComplete={setOutput} outputs={outputs} setOutputs={setOutputs} viewInput={viewInput} setViewInput={setViewInput} setUploads={setUploads} uploads={uploads} />
            </TabPanel>
          </Box>

          {/* right-side vertical tabs (fixed rail) */}
          <Tabs
            orientation="vertical"
            value={tab}
            onChange={(_, v) => setTab(v)}
            variant="scrollable"
            sx={{
              borderLeft: 1,
              borderColor: 'divider',
              height: '100%',
              flex: '0 0 200px',   // 200 px wide, flex-shrink: 0
              minWidth: 200,       // never go below this
            }}
          >
            <Tab icon={<Source />}  iconPosition="start" label="Annotation" />
            <Tab icon={<Share />}   iconPosition="start" label="Cell Interaction" />
            <Tab icon={<Insights />} iconPosition="start" label="Tumor Prediction" />
          </Tabs>
        </Box>
      </Paper>
    </Box>
  );
}