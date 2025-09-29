import React, { useState, useMemo } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TableSortLabel,
  Chip,
  Stack,
  TextField,
  FormControl,
  Select,
  MenuItem,
  InputLabel,
  SelectChangeEvent,
  Paper,
  IconButton,
  Tooltip,
} from '@mui/material';
import DownloadIcon from '@mui/icons-material/Download';
import { AnnotationDetail } from '../../services/api';

interface ClusterAnnotationTableProps {
  annotations: AnnotationDetail[];
  title?: string;
}

type SortField = 'cluster' | 'cell_type' | 'z_score' | 'confidence';
type SortDirection = 'asc' | 'desc';

const ClusterAnnotationTable: React.FC<ClusterAnnotationTableProps> = ({
  annotations,
  title = 'Cluster Annotation Results'
}) => {
  const [sortField, setSortField] = useState<SortField>('z_score');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [confidenceFilter, setConfidenceFilter] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState<string>('');

  // Sort and filter annotations
  const processedAnnotations = useMemo(() => {
    let filtered = annotations;

    // Apply confidence filter
    if (confidenceFilter !== 'all') {
      filtered = filtered.filter(annotation => annotation.confidence === confidenceFilter);
    }

    // Apply search filter
    if (searchTerm) {
      const searchLower = searchTerm.toLowerCase();
      filtered = filtered.filter(annotation =>
        annotation.cluster.toLowerCase().includes(searchLower) ||
        annotation.cell_type.toLowerCase().includes(searchLower)
      );
    }

    // Apply sorting
    return [...filtered].sort((a, b) => {
      let aValue: string | number = a[sortField];
      let bValue: string | number = b[sortField];

      // Handle special cases
      if (sortField === 'cluster') {
        // Sort clusters numerically if they're numbers
        const aNum = parseInt(aValue as string);
        const bNum = parseInt(bValue as string);
        if (!isNaN(aNum) && !isNaN(bNum)) {
          aValue = aNum;
          bValue = bNum;
        }
      }

      if (sortField === 'confidence') {
        // Custom sort order for confidence
        const confidenceOrder = { 'High': 3, 'Medium': 2, 'Low': 1 };
        aValue = confidenceOrder[aValue as keyof typeof confidenceOrder] || 0;
        bValue = confidenceOrder[bValue as keyof typeof confidenceOrder] || 0;
      }

      if (typeof aValue === 'string' && typeof bValue === 'string') {
        return sortDirection === 'asc'
          ? aValue.localeCompare(bValue)
          : bValue.localeCompare(aValue);
      }

      return sortDirection === 'asc'
        ? (aValue as number) - (bValue as number)
        : (bValue as number) - (aValue as number);
    });
  }, [annotations, sortField, sortDirection, confidenceFilter, searchTerm]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
  };

  const getConfidenceColor = (confidence: string) => {
    switch (confidence) {
      case 'High': return 'success';
      case 'Medium': return 'warning';
      case 'Low': return 'error';
      default: return 'default';
    }
  };

  const downloadCSV = () => {
    const csvContent = [
      'Cluster,Cell Type,Z-Score,Confidence,High Quality',
      ...processedAnnotations.map(annotation =>
        `${annotation.cluster},"${annotation.cell_type}",${annotation.z_score},${annotation.confidence},${annotation.is_nice}`
      )
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'cluster_annotations.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  };

  const confidenceCounts = useMemo(() => {
    const counts = { High: 0, Medium: 0, Low: 0 };
    annotations.forEach(annotation => {
      counts[annotation.confidence]++;
    });
    return counts;
  }, [annotations]);

  if (annotations.length === 0) {
    return (
      <Card>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            {title}
          </Typography>
          <Typography color="text.secondary">
            No annotation details available.
          </Typography>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent>
        <Stack spacing={3}>
          {/* Header */}
          <Box display="flex" justifyContent="space-between" alignItems="center">
            <Typography variant="h6">
              {title}
            </Typography>
            <Tooltip title="Download as CSV">
              <IconButton onClick={downloadCSV} size="small">
                <DownloadIcon />
              </IconButton>
            </Tooltip>
          </Box>

          {/* Summary */}
          <Stack direction="row" spacing={2} flexWrap="wrap" useFlexGap>
            <Chip
              label={`${processedAnnotations.length} clusters`}
              variant="outlined"
            />
            <Chip
              label={`${confidenceCounts.High} high confidence`}
              color="success"
              variant="outlined"
            />
            <Chip
              label={`${confidenceCounts.Medium} medium confidence`}
              color="warning"
              variant="outlined"
            />
            <Chip
              label={`${confidenceCounts.Low} low confidence`}
              color="error"
              variant="outlined"
            />
          </Stack>

          {/* Filters */}
          <Stack direction="row" spacing={2} alignItems="center">
            <TextField
              size="small"
              label="Search clusters or cell types"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              sx={{ minWidth: 250 }}
            />

            <FormControl size="small" sx={{ minWidth: 150 }}>
              <InputLabel>Confidence</InputLabel>
              <Select
                value={confidenceFilter}
                label="Confidence"
                onChange={(e: SelectChangeEvent) => setConfidenceFilter(e.target.value)}
              >
                <MenuItem value="all">All</MenuItem>
                <MenuItem value="High">High</MenuItem>
                <MenuItem value="Medium">Medium</MenuItem>
                <MenuItem value="Low">Low</MenuItem>
              </Select>
            </FormControl>
          </Stack>

          {/* Table */}
          <TableContainer component={Paper} sx={{ maxHeight: 600 }}>
            <Table stickyHeader size="small">
              <TableHead>
                <TableRow>
                  <TableCell>
                    <TableSortLabel
                      active={sortField === 'cluster'}
                      direction={sortField === 'cluster' ? sortDirection : 'asc'}
                      onClick={() => handleSort('cluster')}
                    >
                      Cluster
                    </TableSortLabel>
                  </TableCell>
                  <TableCell>
                    <TableSortLabel
                      active={sortField === 'cell_type'}
                      direction={sortField === 'cell_type' ? sortDirection : 'asc'}
                      onClick={() => handleSort('cell_type')}
                    >
                      Cell Type
                    </TableSortLabel>
                  </TableCell>
                  <TableCell align="right">
                    <TableSortLabel
                      active={sortField === 'z_score'}
                      direction={sortField === 'z_score' ? sortDirection : 'asc'}
                      onClick={() => handleSort('z_score')}
                    >
                      Z-Score
                    </TableSortLabel>
                  </TableCell>
                  <TableCell>
                    <TableSortLabel
                      active={sortField === 'confidence'}
                      direction={sortField === 'confidence' ? sortDirection : 'asc'}
                      onClick={() => handleSort('confidence')}
                    >
                      Confidence
                    </TableSortLabel>
                  </TableCell>
                  <TableCell align="center">Quality</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {processedAnnotations.map((annotation, index) => (
                  <TableRow key={`${annotation.cluster}-${annotation.cell_type}-${index}`}>
                    <TableCell>
                      <Typography variant="body2" fontWeight="medium">
                        {annotation.cluster}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2">
                        {annotation.cell_type}
                      </Typography>
                    </TableCell>
                    <TableCell align="right">
                      <Typography variant="body2" fontWeight="medium">
                        {annotation.z_score.toFixed(2)}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Chip
                        label={annotation.confidence}
                        color={getConfidenceColor(annotation.confidence) as any}
                        size="small"
                        variant="outlined"
                      />
                    </TableCell>
                    <TableCell align="center">
                      {annotation.is_nice && (
                        <Chip
                          label="✓"
                          color="success"
                          size="small"
                          sx={{ minWidth: 'auto', width: 24, fontSize: '0.75rem' }}
                        />
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>

          <Typography variant="body2" color="text.secondary">
            Showing {processedAnnotations.length} of {annotations.length} clusters.
            Z-scores indicate annotation confidence - higher values suggest stronger evidence.
            Quality markers (✓) indicate high-confidence annotations validated by the analysis pipeline.
          </Typography>
        </Stack>
      </CardContent>
    </Card>
  );
};

export default ClusterAnnotationTable;