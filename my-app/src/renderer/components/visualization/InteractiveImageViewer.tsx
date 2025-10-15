import React, { useState } from 'react';
import {
  Box,
  Card,
  CardContent,
  CardMedia,
  CardActionArea,
  CardActions,
  Typography,
  Grid,
  Dialog,
  DialogContent,
  DialogTitle,
  IconButton,
  Button,
  Zoom,
  Fade,
  Chip,
  Stack,
  useTheme,
  alpha
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import DownloadIcon from '@mui/icons-material/Download';
import FullscreenIcon from '@mui/icons-material/Fullscreen';
import ZoomInIcon from '@mui/icons-material/ZoomIn';
import ZoomOutIcon from '@mui/icons-material/ZoomOut';
import NavigateBeforeIcon from '@mui/icons-material/NavigateBefore';
import NavigateNextIcon from '@mui/icons-material/NavigateNext';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';

interface ImageFile {
  path: string;
  name: string;
  type: string;
  size_mb?: number;
}

interface InteractiveImageViewerProps {
  images: ImageFile[];
  title: string;
  category: string;
}

export default function InteractiveImageViewer({ images, title, category }: InteractiveImageViewerProps) {
  const theme = useTheme();
  const [selectedImage, setSelectedImage] = useState<ImageFile | null>(null);
  const [selectedIndex, setSelectedIndex] = useState<number>(-1);
  const [zoomLevel, setZoomLevel] = useState(1);
  const [imageLoading, setImageLoading] = useState<{ [key: string]: boolean }>({});

  const handleImageClick = (image: ImageFile, index: number) => {
    setSelectedImage(image);
    setSelectedIndex(index);
    setZoomLevel(1);
  };

  const handleClose = () => {
    setSelectedImage(null);
    setSelectedIndex(-1);
    setZoomLevel(1);
  };

  const handleZoomIn = () => {
    setZoomLevel(prev => Math.min(prev + 0.25, 3));
  };

  const handleZoomOut = () => {
    setZoomLevel(prev => Math.max(prev - 0.25, 0.5));
  };

  const handlePrevious = () => {
    if (selectedIndex > 0) {
      setSelectedImage(images[selectedIndex - 1]);
      setSelectedIndex(selectedIndex - 1);
      setZoomLevel(1);
    }
  };

  const handleNext = () => {
    if (selectedIndex < images.length - 1) {
      setSelectedImage(images[selectedIndex + 1]);
      setSelectedIndex(selectedIndex + 1);
      setZoomLevel(1);
    }
  };

  const handleDownload = (image: ImageFile) => {
    const link = document.createElement('a');
    link.href = `http://127.0.0.1:8000/preview_img?path=${encodeURIComponent(image.path)}`;
    link.download = image.name + '.png';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const getCategoryColor = () => {
    switch(category.toLowerCase()) {
      case 'heatmap': return theme.palette.error.main;
      case 'dotplot': return theme.palette.info.main;
      case 'network': return theme.palette.success.main;
      default: return theme.palette.primary.main;
    }
  };

  const formatImageName = (name: string) => {
    // Make names more readable by replacing underscores and capitalizing
    return name
      .replace(/_/g, ' ')
      .replace(/\b\w/g, l => l.toUpperCase())
      .replace(/Cpdb/g, 'CellPhoneDB')
      .replace(/\d{8} \d{4}/g, ''); // Remove timestamps
  };

  return (
    <>
      <Box sx={{ mb: 2 }}>
        <Stack direction="row" spacing={2} alignItems="center" sx={{ mb: 2 }}>
          <Typography variant="h6" sx={{ fontWeight: 600 }}>
            {title}
          </Typography>
          <Chip
            label={`${images.length} images`}
            size="small"
            sx={{
              backgroundColor: alpha(getCategoryColor(), 0.1),
              color: getCategoryColor(),
              fontWeight: 500
            }}
          />
        </Stack>

        <Grid container spacing={3}>
          {images.map((image, index) => (
            <Grid item xs={12} sm={6} md={4} lg={3} key={index}>
              <Zoom in timeout={300 + index * 100}>
                <Card
                  sx={{
                    height: '100%',
                    display: 'flex',
                    flexDirection: 'column',
                    transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                    '&:hover': {
                      transform: 'translateY(-4px)',
                      boxShadow: theme.shadows[8],
                      '& .image-overlay': {
                        opacity: 1
                      }
                    }
                  }}
                >
                  <CardActionArea
                    onClick={() => handleImageClick(image, index)}
                    sx={{ position: 'relative', flexGrow: 1 }}
                  >
                    <Box sx={{ position: 'relative', paddingTop: '75%' }}>
                      <CardMedia
                        component="img"
                        image={`http://127.0.0.1:8000/preview_img?path=${encodeURIComponent(image.path)}`}
                        alt={image.name}
                        onLoad={() => setImageLoading(prev => ({ ...prev, [image.path]: false }))}
                        onLoadStart={() => setImageLoading(prev => ({ ...prev, [image.path]: true }))}
                        sx={{
                          position: 'absolute',
                          top: 0,
                          left: 0,
                          width: '100%',
                          height: '100%',
                          objectFit: 'cover'
                        }}
                      />
                      <Box
                        className="image-overlay"
                        sx={{
                          position: 'absolute',
                          top: 0,
                          left: 0,
                          right: 0,
                          bottom: 0,
                          backgroundColor: 'rgba(0, 0, 0, 0.7)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          opacity: 0,
                          transition: 'opacity 0.3s'
                        }}
                      >
                        <Stack direction="row" spacing={1}>
                          <IconButton
                            sx={{
                              color: 'white',
                              backgroundColor: 'rgba(255, 255, 255, 0.1)',
                              '&:hover': { backgroundColor: 'rgba(255, 255, 255, 0.2)' }
                            }}
                          >
                            <FullscreenIcon />
                          </IconButton>
                        </Stack>
                      </Box>
                    </Box>
                  </CardActionArea>
                  <CardContent sx={{ flexGrow: 0 }}>
                    <Typography
                      variant="subtitle2"
                      noWrap
                      sx={{ fontWeight: 500 }}
                      title={formatImageName(image.name)}
                    >
                      {formatImageName(image.name)}
                    </Typography>
                    {image.size_mb && (
                      <Typography variant="caption" color="text.secondary">
                        {image.size_mb.toFixed(1)} MB
                      </Typography>
                    )}
                  </CardContent>
                  <CardActions sx={{ justifyContent: 'space-between', px: 2, pb: 2 }}>
                    <IconButton
                      size="small"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDownload(image);
                      }}
                      title="Download"
                    >
                      <DownloadIcon fontSize="small" />
                    </IconButton>
                    <IconButton
                      size="small"
                      onClick={() => handleImageClick(image, index)}
                      title="View Details"
                    >
                      <InfoOutlinedIcon fontSize="small" />
                    </IconButton>
                  </CardActions>
                </Card>
              </Zoom>
            </Grid>
          ))}
        </Grid>
      </Box>

      {/* Full Screen Image Dialog */}
      <Dialog
        open={Boolean(selectedImage)}
        onClose={handleClose}
        maxWidth={false}
        fullWidth
        PaperProps={{
          sx: {
            backgroundColor: 'rgba(0, 0, 0, 0.95)',
            maxWidth: '95vw',
            maxHeight: '95vh',
            m: 2
          }
        }}
      >
        {selectedImage && (
          <>
            <DialogTitle sx={{
              color: 'white',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              borderBottom: '1px solid rgba(255, 255, 255, 0.1)'
            }}>
              <Box>
                <Typography variant="h6">{formatImageName(selectedImage.name)}</Typography>
                <Typography variant="caption" sx={{ opacity: 0.7 }}>
                  {selectedIndex + 1} of {images.length}
                </Typography>
              </Box>
              <Stack direction="row" spacing={1}>
                <IconButton
                  onClick={handleZoomOut}
                  disabled={zoomLevel <= 0.5}
                  sx={{ color: 'white' }}
                >
                  <ZoomOutIcon />
                </IconButton>
                <Chip
                  label={`${Math.round(zoomLevel * 100)}%`}
                  sx={{
                    color: 'white',
                    borderColor: 'rgba(255, 255, 255, 0.3)'
                  }}
                  variant="outlined"
                />
                <IconButton
                  onClick={handleZoomIn}
                  disabled={zoomLevel >= 3}
                  sx={{ color: 'white' }}
                >
                  <ZoomInIcon />
                </IconButton>
                <IconButton
                  onClick={() => handleDownload(selectedImage)}
                  sx={{ color: 'white' }}
                >
                  <DownloadIcon />
                </IconButton>
                <IconButton
                  onClick={handleClose}
                  sx={{ color: 'white' }}
                >
                  <CloseIcon />
                </IconButton>
              </Stack>
            </DialogTitle>
            <DialogContent sx={{
              p: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              position: 'relative',
              overflow: 'auto'
            }}>
              <Fade in timeout={500}>
                <Box
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    minHeight: '60vh',
                    p: 2,
                    position: 'relative'
                  }}
                >
                  <img
                    src={`http://127.0.0.1:8000/preview_img?path=${encodeURIComponent(selectedImage.path)}`}
                    alt={selectedImage.name}
                    style={{
                      maxWidth: '100%',
                      maxHeight: '75vh',
                      objectFit: 'contain',
                      transform: `scale(${zoomLevel})`,
                      transition: 'transform 0.3s ease',
                      cursor: zoomLevel > 1 ? 'grab' : 'default'
                    }}
                  />

                  {/* Navigation Buttons */}
                  {selectedIndex > 0 && (
                    <IconButton
                      onClick={handlePrevious}
                      sx={{
                        position: 'absolute',
                        left: 20,
                        top: '50%',
                        transform: 'translateY(-50%)',
                        backgroundColor: 'rgba(0, 0, 0, 0.5)',
                        color: 'white',
                        '&:hover': {
                          backgroundColor: 'rgba(0, 0, 0, 0.7)'
                        }
                      }}
                    >
                      <NavigateBeforeIcon fontSize="large" />
                    </IconButton>
                  )}

                  {selectedIndex < images.length - 1 && (
                    <IconButton
                      onClick={handleNext}
                      sx={{
                        position: 'absolute',
                        right: 20,
                        top: '50%',
                        transform: 'translateY(-50%)',
                        backgroundColor: 'rgba(0, 0, 0, 0.5)',
                        color: 'white',
                        '&:hover': {
                          backgroundColor: 'rgba(0, 0, 0, 0.7)'
                        }
                      }}
                    >
                      <NavigateNextIcon fontSize="large" />
                    </IconButton>
                  )}
                </Box>
              </Fade>
            </DialogContent>
          </>
        )}
      </Dialog>
    </>
  );
}