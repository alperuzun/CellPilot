import React, { useState, useMemo, useEffect } from 'react';
import {
  Box, Typography, Chip, ImageList, ImageListItem, List, ListItemButton,
  ListItemIcon, ListItemText, Paper, Divider, Table, TableBody, TableCell,
  TableRow, TableHead, Button
} from '@mui/material';
import AdataSummaryPreview from './AdataSummaryPreview';


interface Props { output?: Record<string, any>, viewInput: boolean, setViewInput: (viewInput: boolean) => void, setUpload: (upload: any) => void, uploads: any[] }
const HEADER = 64;
export default function AnnotationResultsDashBoard({ output, viewInput, setViewInput, setUpload, uploads }: Props) {
  /*
    `artefacts` is an array of tuples:  [absolutePath, categoryLabel]
    We gather them from every array stored in `output.data` and remove duplicate
    *paths* (not reference-equal tuples).
  */
  const artefacts: [string, string][] = useMemo(() => {
    if (!output?.data.data) return [];
    const tuples: [string, string][] = [];
    Object.values(output.data.data).forEach((v: any) => {
      if (Array.isArray(v)) {
        v.forEach((elem: any) => {
          if (Array.isArray(elem) && elem.length === 2 && typeof elem[0] === 'string') {
            tuples.push(elem as [string, string]);
          }
        });
      }
    });
    // De-duplicate by absolute path
    const seen = new Set<string>();
    const uniq: [string, string][] = [];
    tuples.forEach(([p, lbl]) => {
      if (!seen.has(p)) {
        seen.add(p);
        uniq.push([p, lbl]);
      }
    });
    return uniq;
  }, [output]);

  /* ------------ categorise ------------------------------------------- */
  const categories = useMemo(() => {
    console.log(artefacts);
    const acc: Record<string, string[]> = {};
    artefacts.forEach(([path, label]) => {
      acc[label] = acc[label] || [];
      acc[label].push(path);
    });
    return acc;   // { label: [paths] }
  }, [artefacts]);

  // Convenience flat list of paths for extension-based filtering
  const allPaths = artefacts.map(([p]) => p);
  const imgs = allPaths.filter(p => /\.png$/i.test(p));

  console.log(output?.data?.data?.adata);
  const [selected, setSelected] = useState<string | null>(null);

  // When the whole output prop changes (user switched tab), reset selection & zoom
  useEffect(() => {
    setSelected(null);
  }, [output]);

  /* choose a sensible default whenever artefacts or summary change */
  useEffect(() => {
    if (selected) return;
    if (output?.data?.data?.adata) {
      setSelected('__SUMMARY__');
    } else if (imgs.length > 0) {
      setSelected(imgs[0]);
    }
  }, [output?.data?.data?.adata, imgs, selected]);

  const [textContent, setTextContent] = useState<string>('');
  const [zoom, setZoom] = useState<number>(1);
  const [showParams, setShowParams] = useState(false); 

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

    if (selected === '__SUMMARY__') {
      return <AdataSummaryPreview summary={output?.data?.data?.adata} />;
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

    if (/\.csv$/i.test(selected)) {
      const rows = textContent.split(/\r?\n/).slice(0, 100).map(r => r.split(','));
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
        <Typography sx={{ p: 1 }} variant="h6">{output?.name}</Typography>
            { !viewInput ? (
            <Button sx={{ position: 'absolute', right: 20, zIndex: 1000, minWidth: 160 }} onClick={() => {
              if (output?.input) {
                    setUpload(uploads.find(u => u.summary.path === output.input));
                    setViewInput(true);
                  } else {
                     alert('No input file for this output');
                  }
              }}>View Input</Button>
            ) : null}
      </Box>
      <Box sx={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* Left rail - simplified to just file names */}
        <Paper variant="outlined" sx={{ width: 200, height: '100%', overflowY: 'auto', bgcolor:'grey.50', resize:'horizontal', overflowX:'auto', minWidth:100, maxWidth:200, pt:1 }}>
          {/* summary shortcut */}
          {output?.data?.data?.adata && (
            <ListItemButton onClick={() => select('__SUMMARY__')}
                           selected={selected === '__SUMMARY__'} sx={{ py: 0.5 }}>
              <ListItemText primary={
                typeof output?.data?.data?.adata.path === 'string' && output?.data?.data?.adata.path !== 'None'
                  ? output?.data?.data?.adata.path.split(/[\\/]/).pop()
                  : `${output?.name ?? 'adata'}_summary`
              }
                            primaryTypographyProps={{ noWrap: true, fontSize: '0.875rem' }}/>
            </ListItemButton>
          )}

          {/* Grouped artefacts by category */}
          {Object.entries(categories).map(([label, paths]) => (
            <React.Fragment key={label}>
              <ListItemButton disabled sx={{ py: 0.5 }}>
                <ListItemText primary={label} primaryTypographyProps={{ fontWeight:'bold', fontSize:'0.75rem' }}/>
              </ListItemButton>
              <List dense disablePadding sx={{ width:'max-content' }}>
                {paths.map(p => (
                  <ListItemButton key={p} onClick={() => select(p)} selected={selected===p} sx={{ pl: 4, minWidth:'max-content', py:0.5 }}>
                    <ListItemText primary={p.split('/').pop()} primaryTypographyProps={{ noWrap:true, fontSize:'0.8rem' }}/>
                  </ListItemButton>
                ))}
              </List>
            </React.Fragment>
          ))}
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

            {!/\.txt$/i.test(selected) && !/\.csv$/i.test(selected) && output?.data?.params && (
              <Box sx={{position: 'absolute', display:'flex', bottom: 20, right: 20, flexDirection:'column', gap: 1, bgcolor: 'rgba(255, 255, 255, 0.7)', overflowX: 'auto', borderRadius: 1}}>
                {!showParams && <Button variant="text" onClick={()=>setShowParams(true)} sx={{ mr: 1, alignSelf: 'center' }}>PARAMS</Button>}
                {showParams && Object.entries(output.data.params).map(([key, value]) => (
                  <Typography variant="caption" key={key}>{key}: {String(value)}</Typography>
                ))}
                {showParams && <Chip sx={{alignSelf: 'right', width: '30px'}} label="-" size="small" clickable onClick={()=>setShowParams(false)} />}
              </Box>
            )}
          </Box>
        </Box>
      </Box>
    </Box>
  );
}
