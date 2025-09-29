import {
    AppBar, Toolbar, Drawer, List, ListItemButton,
    ListItemIcon, ListItemText, Box, Button, Stack,
    Divider, Tabs, Tab
  } from '@mui/material';
  import { UploadFile, BarChart, Info, MenuBook, Home } from '@mui/icons-material';
  import { useState } from 'react';
  import logo from '../../assets/cellpilot_logo_github.jpg';
import GettingStarted from '../pages/GettingStarted';
import About from '../pages/About';
import Documentation from '../pages/Documentation';
import mock_annotation from '../mock/Annoresponse.json';
import mock_inferCNV from '../mock/Infercnresponse.json';
import mock_cell_interaction from '../mock/cellphonedbresponse.json';
import mock_input from '../mock/mock_input.json';
  const drawerWidth = 180;

  export interface Upload { id: number, name: string, summary: Record<string, any>, outputs: Output[] }
  export interface Output { id: number, name: string, data: Record<string, any>, input: string }
  
  export default function PrimaryLayout() {
    const [currentTab, setCurrentTab] = useState(0);
    const [uploads, setUploads] = useState<Upload[]>([{id: 1, name: 'mock_input', summary: mock_input, outputs: [{id: 1, name: 'mock_annotation', data: mock_annotation, input: mock_input.path}, {id: 2, name: 'mock_inferCNV', data: mock_inferCNV, input: mock_input.path}, {id: 3, name: 'mock_cell_interaction', data: mock_cell_interaction, input: mock_input.path}]}]);
    const [outputs, setOutputs] = useState<Output[]>([{id: 1, name: 'mock_annotation', data: mock_annotation, input: mock_input.path}, {id: 2, name: 'mock_inferCNV', data: mock_inferCNV, input: mock_input.path}, {id: 3, name: 'mock_cell_interaction', data: mock_cell_interaction, input: mock_input.path}]);
    const [upload, setUpload] = useState<Upload | null>(null);
    const [output, setOutput] = useState<Output | null>(null);
    const [viewInput, setViewInput] = useState(true);

  
    /* ───────── file-upload helper (IPC bridge) ───────── */
    const handleUploadClick = async () => {
      const fullPath = await window.backend.openAdataFile();   // single dialog
      if (!fullPath) return;                                   // user cancelled
  
      const fileName = fullPath.split('/').pop();
      
      // Check file extension
      const supportedExtensions = ['.h5ad', '.h5', '.hdf5'];
      const fileExtension = fileName?.toLowerCase().substring(fileName.lastIndexOf('.')) || '';
      
      if (!supportedExtensions.includes(fileExtension)) {
        alert(`Unsupported file format. Please select a file with one of these extensions: ${supportedExtensions.join(', ')}`);
        return;
      }
      
      if (uploads.some(u => u.name === fileName)) {
        alert('File already uploaded');
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
  
    const drawer = (
      <div>
        <Toolbar />
        
        {/* Navigation Tabs */}
        <Box sx={{ px: 1, py: 1 }}>
          <Tabs
            orientation="vertical"
            value={currentTab}
            onChange={(e, newValue) => setCurrentTab(newValue)}
            sx={{
              '& .MuiTab-root': {
                minHeight: 48,
                alignItems: 'flex-start',
                textAlign: 'left',
                fontSize: '0.875rem'
              }
            }}
          >
            <Tab 
              icon={<Home />} 
              iconPosition="start" 
              label="Analysis" 
              sx={{ justifyContent: 'flex-start' }}
            />
            <Tab 
              icon={<MenuBook />} 
              iconPosition="start" 
              label="Documentation" 
              sx={{ justifyContent: 'flex-start' }}
            />
            <Tab 
              icon={<Info />} 
              iconPosition="start" 
              label="About" 
              sx={{ justifyContent: 'flex-start' }}
            />
          </Tabs>
        </Box>
        
        <Divider sx={{ my: 1 }} />
        
        {/* File Management - Only show in Analysis tab */}
        {currentTab === 0 && (
          <List dense>
            <ListItemButton>
              <ListItemIcon><UploadFile/></ListItemIcon>
              <ListItemText primary="Uploads" />
            </ListItemButton>
          {/* ── scrollable Upload names ─────────────────────────────── */}
          <Box sx={{ maxHeight: 200, overflowY: 'auto', overflowX: 'auto' }}>
            <List dense disablePadding sx={{ width: '100%' }}>
              {uploads.length > 0 ? uploads.map((u) => (
                <ListItemButton
                  key={u.id}
                  sx={{ pl: 4, minWidth: '100%'}} 
                  onClick={() => {
                    setUpload(u);
                    setOutput(null);
                    setViewInput(true);
                  }}
                >
                  <ListItemText
                    primary={u.name}
                    sx={{ whiteSpace: 'nowrap', pl: 4 }}
                  />
                </ListItemButton>
              )) : (
                <ListItemText
                  primary="No uploads"
                  sx={{ whiteSpace: 'nowrap', pl: 4}}
                />
              )}
            </List>
          </Box>
          <Divider />
          <ListItemButton>
                <ListItemIcon><BarChart/></ListItemIcon>
                <ListItemText primary="Outputs" />
            </ListItemButton>
            {/* ── scrollable Output names ─────────────────────────────── */}
            <Box sx={{ maxHeight: 200, overflowY: 'auto', overflowX: 'auto' }}>
              <List dense disablePadding sx={{ width: '100%' }}>

                {outputs.length > 0 ? outputs.map((o) => (
                  <ListItemButton
                    key={o.id}
                    sx={{ pl: 4, minWidth: '100%' }}
                    onClick={() => {
                        setOutput(o);
                        setUpload(uploads.find(u => u.summary.path === o.input) ?? null);
                        setViewInput(false);
                      }}
                  >
                    <ListItemText
                      primary={o.name}
                      sx={{ whiteSpace: 'nowrap', pl: 4 }}
                    />
                  </ListItemButton>
                )) : (
                  <ListItemText
                    primary="No outputs"
                    sx={{ whiteSpace: 'nowrap', pl: 4}}
                  />
                )}
              </List>
            </Box>
          </List>
        )}
      </div>
    );
  
    return (
      /* full-viewport high-level flex row  */
      <Box sx={{ display: 'flex', height: '100vh' }}>
        {/* ---- top bar ---- */}
        <AppBar
          position="fixed"
          sx={{ zIndex: (theme) => theme.zIndex.drawer + 1 }}
        >
          <Toolbar sx={{ gap: 1 }}>
            {/* ── logo + brand ─────────────────────────────────────────────── */}
            <Box
              component="img"
              src={logo}
              alt="CellPilot logo"
              sx={{ width: 48, height: 48, mr: 1 }}
            />
            {/* <Typography
              variant="h6"
              noWrap
              component="a"
              sx={{
                mr: 2,
                display: 'flex',          // show on all break-points
                fontFamily: 'monospace',
                fontWeight: 700,
                letterSpacing: '.2rem',
                color: 'inherit',
                textDecoration: 'none',
              }}
            >
              CellPilot
            </Typography>
            {/* main action buttons - only show upload in analysis tab */}
            {currentTab === 0 && (
              <Stack direction="row" spacing={1} sx={{ ml: 2 }}>
                <Button
                  variant="contained"
                  size="small"
                  startIcon={<UploadFile />}
                  onClick={handleUploadClick}
                >
                  Upload File
                </Button>
              </Stack>
            )}
            {/* right-side empty grow */}
            <Box sx={{ flexGrow: 1 }} />
            {/* right cluster – avatars, settings, etc. */}
          </Toolbar>
        </AppBar>
  
        {/* ---- left drawer ---- */}
        <Drawer
          variant="permanent"
          sx={{
            width: drawerWidth,
            flexShrink: 0,
            [`& .MuiDrawer-paper`]: { width: drawerWidth, boxSizing: 'border-box' },
          }}
        >
          {drawer}
        </Drawer>
  
        {/* ---- main content ---- */}
        <Box
          component="main"
          /* column-flex so routed pages can flex-grow */
          sx={{
            maxWidth: '100%',
            overflowX: 'hidden',
            width: '100%',
            p: 0,
            mt: 6,              /* keep offset for AppBar height (~48 px) */
            display: 'flex',
            flexDirection: 'column',
            minHeight: 0        /* allow children to shrink / scroll */
          }}
        >
          {/* Render content based on current tab */}
          {currentTab === 0 && (
            <GettingStarted 
              upload={upload} 
              output={output} 
              outputs={outputs} 
              setOutput={setOutput} 
              setOutputs={setOutputs} 
              viewInput={viewInput} 
              setViewInput={setViewInput} 
              uploads={uploads} 
              setUploads={setUploads} 
              setUpload={setUpload} 
            />
          )}
          {currentTab === 1 && <Documentation />}
          {currentTab === 2 && <About />}
        </Box>
      </Box>
    );
  }