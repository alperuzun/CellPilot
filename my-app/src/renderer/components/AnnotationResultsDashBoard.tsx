import React, { useState, useMemo, useEffect } from 'react';
import {
  Box, Typography, Chip, ImageList, ImageListItem, List, ListItemButton,
  ListItemIcon, ListItemText, Paper, Divider, Table, TableBody, TableCell,
  TableRow, TableHead,
} from '@mui/material';
import ImageIcon from '@mui/icons-material/Image';
import DescriptionIcon from '@mui/icons-material/Description';
import mock from '../mock/Annoresponse.json';
import AdataSummaryPreview from './AdataSummaryPreview';


interface Props { output?: Record<string, any> }
const HEADER = 64;
export default function AnnotationResultsDashBoard({ output }: Props) {
  /* ------------ flatten artefacts ------------------------------------- */
  const artefacts: string[] = useMemo(() => {
    const arr: string[] = [];
    if (!output?.data) return arr;
    Object.values(output.data).forEach((v: any) => {
      if (Array.isArray(v)) arr.push(...v as string[]);
    });
    return arr;
  }, [output]);

  /* ------------ categorise ------------------------------------------- */
  const imgs = artefacts.filter(p => /\.png$/i.test(p));
  const csvs = artefacts.filter(p => /\.csv$/i.test(p));
  const txts = artefacts.filter(p => /\.txt$/i.test(p));
  const pkls = artefacts.filter(p => /\.pkl$/i.test(p));
  const summary = output?.data?.adata;
  const [selected, setSelected] = useState<string | null>(imgs[0] ?? null);
  const [textContent, setTextContent] = useState<string>('');
  const [zoom, setZoom] = useState<number>(1);

  /* -------- fetch text when CSV/TXT selected ------------------------- */
  useEffect(() => {
    if (!selected) return;
    if (/\.(csv|txt)$/i.test(selected)) {
      const url = /\.csv$/i.test(selected)
        ? `http://127.0.0.1:8000/preview_csv?path=${encodeURIComponent(selected)}`
        : `http://127.0.0.1:8000/preview_txt?path=${encodeURIComponent(selected)}`;

      fetch(url)
        .then(r => r.text())
        .then(setTextContent)
        .catch(() => setTextContent('Failed to load file'));
    }
  }, [selected]);

  const buildImgUrl = (absPath: string) =>
    `http://127.0.0.1:8000/preview_img?path=${encodeURIComponent(absPath)}`;

  /* ------------ helpers ---------------------------------------------- */
  const select = (p: string) => setSelected(p);

  const renderPreview = () => {
    if (!selected) return <Typography color="text.secondary">Select a file</Typography>;

    if (selected === summary) {
      return <AdataSummaryPreview summary={output?.data?.adata} />;
    }
    if (/\.png$/i.test(selected)) {
      return (
        <Box sx={{ 
          p: 2, 
          overflow: 'auto',
          height: '100%',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'flex-start'
        }}>
          <Box sx={{ 
            display: 'inline-block', 
            transform: `scale(${zoom})`, 
            transformOrigin: 'center top'
          }}>
            <img 
              src={buildImgUrl(selected)} 
              style={{ 
                display: 'block', 
                maxWidth: 'none'
              }} 
            />
          </Box>
        </Box>
      );
    }

    // CSV preview – show first 20 rows crude split
    if (/\.csv$/i.test(selected)) {
      const rows = textContent.split(/\r?\n/).slice(0, 20).map(r => r.split(','));
      const headers = rows[0] || [];
      const body   = rows.slice(1);
      return (
        <Table size="small" sx={{ minWidth: 'max-content' }}>
          <TableHead>
            <TableRow>{headers.map((h,i)=>(<TableCell key={i} sx={{fontWeight:'bold'}}>{h}</TableCell>))}</TableRow>
          </TableHead>
          <TableBody>
            {body.map((r,i)=>(
              <TableRow key={i}>{r.map((c,j)=>(<TableCell key={j}>{c}</TableCell>))}</TableRow>
            ))}
          </TableBody>
        </Table>
      );
    }

    // TXT preview
    if (/\.txt$/i.test(selected)) {
      return (
        <Box sx={{ p: 2 }}>
          <Box component="pre" sx={{ whiteSpace: 'pre-wrap', maxHeight: '60vh', overflow: 'auto', bgcolor: 'grey.100', p: 1, borderRadius:1 }}>
            {textContent || 'Loading…'}
          </Box>
        </Box>
      );
    }
    return (
        <Box sx={{ p: 2 }}>
          <Typography color="text.secondary">
            No preview available –&nbsp;
          </Typography>
        </Box>
      );
    return null;
  };

  /* ------------ component -------------------------------------------- */
  return (
    <Box sx={{ display: 'flex', height: '100%', overflow: 'hidden', width: '100%', flexDirection: 'column' }}>
      <Box
        sx={{
          position: 'sticky',
          top: 10,
          zIndex: 1,
          bgcolor: 'grey.50',
          borderBottom: 1,
          borderColor: 'divider',
          display: 'flex',
          alignItems: 'center',
          gap: 2,
          height: `${HEADER}px`,
          px: 2,
        }}
      >
        <Typography sx={{ p: 1 }} variant="h6">{output?.name} Results</Typography>
      </Box>
      <Box sx={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* Left rail - simplified to just file names */}
        <Paper variant="outlined" sx={{ width: 200, overflow: 'auto', bgcolor:'grey.50', resize:'horizontal', minWidth:100, maxWidth:200 }}>
          {/* left rail  – summary only when present */}
          {summary && (
            <ListItemButton onClick={() => select(summary)}
                           selected={summary === selected} sx={{ py: 0.5 }}>
              <ListItemText primary={summary.split('/').pop()}
                            primaryTypographyProps={{ noWrap: true, fontSize: '0.875rem' }}/>
            </ListItemButton>
          )}
          {imgs.map((p) => (
            <ListItemButton
              key={p}
              onClick={() => select(p)}
              selected={selected === p}
              sx={{ py: 0.5 }}
            >
              <ListItemIcon sx={{ minWidth: 36 }}>
                <ImageIcon fontSize="small" />
              </ListItemIcon>
              <ListItemText 
                primary={p.split('/').pop()} 
                primaryTypographyProps={{ noWrap: true, fontSize: '0.875rem' }}
              />
            </ListItemButton>
          ))}
          <List dense>
            {[...csvs, ...txts].map(p => (
              <ListItemButton key={p} onClick={() => select(p)} selected={p===selected} sx={{ py: 0.5 }}>
                <ListItemIcon sx={{ minWidth: 36 }}>
                  <DescriptionIcon fontSize="small" />
                </ListItemIcon>
                <ListItemText 
                  primary={p.split('/').pop()} 
                  primaryTypographyProps={{ noWrap: true, fontSize: '0.875rem' }}
                />
              </ListItemButton>
            ))}
          </List>
          {pkls.length > 0 && (
            <>
              <Divider />
              <Typography sx={{ p: 1, fontWeight:'bold' }} variant="subtitle1">
                Other ({pkls.length})
              </Typography>
              <List dense>
                {pkls.map(p => (
                  <ListItemButton key={p} onClick={() => select(p)}
                                  selected={p===selected} sx={{ py: 0.5 }}>
                    <ListItemIcon sx={{ minWidth: 36 }}>
                      <DescriptionIcon fontSize="small" />
                    </ListItemIcon>
                    <ListItemText primary={p.split('/').pop()}
                                  primaryTypographyProps={{ noWrap: true, fontSize: '0.875rem' }}/>
                  </ListItemButton>
                ))}
              </List>
            </>
          )}
        </Paper>

        {/* Preview area with zoom controls directly in the content area */}
        <Box sx={{ flex:1, overflow: 'auto', position:'relative', borderLeft:1, borderTop:1, borderRight:1, borderColor:'divider', bgcolor:'background.default' }}>
          {/* Removed sticky header */}
          
          <Box sx={{ height: '100%', position: 'relative' }}>
            {renderPreview()}
            
            {/* Floating zoom controls for images */}
            {selected && /\.png$/i.test(selected) && (
              <Box sx={{ 
                position: 'absolute', 
                top: 10, 
                right: 10, 
                display: 'flex', 
                gap: 1,
                bgcolor: 'rgba(255,255,255,0.7)',
                borderRadius: 1,
                p: 0.5
              }}>
                <Typography variant="caption" sx={{ mr: 1, alignSelf: 'center' }}>
                  {selected.split('/').pop()}
                </Typography>
                <Chip label="+" size="small" clickable onClick={()=>setZoom(z=>Math.min(z+0.25,4))} />
                <Chip label="-" size="small" clickable onClick={()=>setZoom(z=>Math.max(z-0.25,0.25))} />
              </Box>
            )}
          </Box>
        </Box>
      </Box>
    </Box>
  );
}
