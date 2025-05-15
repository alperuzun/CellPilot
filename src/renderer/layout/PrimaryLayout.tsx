import {
  AppBar, Toolbar, Typography, IconButton, Drawer, List, ListItemButton,
  ListItemIcon, ListItemText, Box, Button, Stack, TextField
} from '@mui/material';
import { UploadFile, Search, BarChart, TableRows, Share } from '@mui/icons-material';
import { useState } from 'react';

const drawerWidth = 240;

export default function PrimaryLayout({ children }: { children: React.ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);

  const handleDrawerToggle = () => setMobileOpen(!mobileOpen);

  const drawer = (
    <div>
      <Toolbar />
      <List dense>
        <ListItemButton>
          <ListItemIcon><UploadFile/></ListItemIcon>
          <ListItemText primary="Uploads" />
        </ListItemButton>
      </List>
    </div>
  );

  return (
    <Box sx={{ display: 'flex' }}>
      {/* ---- top bar ---- */}
      <AppBar
        position="fixed"
        sx={{ zIndex: (theme) => theme.zIndex.drawer + 1 }}
      >
        <Toolbar sx={{ gap: 1 }}>
          <IconButton color="inherit" edge="start" onClick={handleDrawerToggle}>
            {/* icon automatically added on small screens by Drawer */}
          </IconButton>
          {/* search box */}
          <TextField
            size="small"
            placeholder="Search by gene, ex: PLOD1"
            InputProps={{ startAdornment: <Search sx={{ mr: 1 }}/> }}
            sx={{ width: 220, background: 'white', borderRadius: 1 }}
          />
          {/* main action buttons */}
          <Stack direction="row" spacing={1} sx={{ ml: 2 }}>
            <Button variant="contained" size="small" startIcon={<UploadFile/>}>
              Upload File
            </Button>
          </Stack>
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
        sx={{ flexGrow: 1, p: 3, mt: 6 }} 
      >
        {children}  
      </Box>
    </Box>
  );
} 