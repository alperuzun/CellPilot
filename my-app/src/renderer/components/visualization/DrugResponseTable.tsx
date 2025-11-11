import React, { useState, useEffect, useMemo } from 'react';
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
  Stack,
  TextField,
  Paper,
  IconButton,
  Tooltip,
  CircularProgress,
  Alert,
  Tabs,
  Tab,
} from '@mui/material';
import DownloadIcon from '@mui/icons-material/Download';
import { AnalysisFile, CSVDataResponse, api } from '../../services/api';

interface DrugResponseTableProps {
  files: AnalysisFile[];
}

interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}

function TabPanel(props: TabPanelProps) {
  const { children, value, index, ...other } = props;
  return (
    <div
      role="tabpanel"
      hidden={value !== index}
      id={`drug-tabpanel-${index}`}
      aria-labelledby={`drug-tab-${index}`}
      {...other}
    >
      {value === index && <Box>{children}</Box>}
    </div>
  );
}

const DrugResponseTable: React.FC<DrugResponseTableProps> = ({ files }) => {
  const [currentTab, setCurrentTab] = useState(0);
  const [csvData, setCsvData] = useState<{ [key: string]: CSVDataResponse }>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortColumn, setSortColumn] = useState<number | null>(null);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');

  // Find IC50 and drug kill CSV files
  const ic50File = files.find(f => f.name.includes('IC50') && f.type === 'csv_data');
  const drugKillFile = files.find(f => f.name.includes('drug_kill') && f.type === 'csv_data');

  // Load CSV data
  useEffect(() => {
    const loadCsvData = async () => {
      setLoading(true);
      setError(null);
      const newData: { [key: string]: CSVDataResponse } = {};

      try {
        if (ic50File) {
          newData['ic50'] = await api.getCSVData(ic50File.path);
        }
        if (drugKillFile) {
          newData['drugKill'] = await api.getCSVData(drugKillFile.path);
        }
        setCsvData(newData);
      } catch (err) {
        console.error('Error loading CSV data:', err);
        setError(err instanceof Error ? err.message : 'Failed to load CSV data');
      } finally {
        setLoading(false);
      }
    };

    if (ic50File || drugKillFile) {
      loadCsvData();
    }
  }, [ic50File, drugKillFile]);

  // Get current CSV data based on tab
  const currentData = currentTab === 0 ? csvData['ic50'] : csvData['drugKill'];

  // Filter and sort drugs
  const processedData = useMemo(() => {
    if (!currentData || currentData.type !== 'drug_response') {
      return null;
    }

    const { drug_names = [], cells = [], values = [] } = currentData;

    // Create drug rows with data
    let drugRows = drug_names.map((drugName, drugIndex) => ({
      drugName,
      drugIndex,
      cellValues: cells.map((_, cellIndex) => values[cellIndex]?.[drugIndex] || 0),
    }));

    // Apply search filter
    if (searchTerm) {
      const searchLower = searchTerm.toLowerCase();
      drugRows = drugRows.filter(row =>
        row.drugName.toLowerCase().includes(searchLower)
      );
    }

    // Apply sorting
    if (sortColumn !== null) {
      drugRows.sort((a, b) => {
        const aValue = a.cellValues[sortColumn] || 0;
        const bValue = b.cellValues[sortColumn] || 0;
        return sortDirection === 'asc' ? aValue - bValue : bValue - aValue;
      });
    }

    return {
      cells,
      drugRows,
    };
  }, [currentData, searchTerm, sortColumn, sortDirection]);

  const handleSort = (cellIndex: number) => {
    if (sortColumn === cellIndex) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(cellIndex);
      setSortDirection('desc');
    }
  };

  // Get color for heatmap cell
  const getCellColor = (value: number, isIC50: boolean): string => {
    if (isNaN(value)) return '#f5f5f5';

    if (isIC50) {
      // IC50: lower is better (more sensitive) - green for low, red for high
      if (value < 0.3) return '#4caf50'; // Green
      if (value < 0.5) return '#8bc34a'; // Light green
      if (value < 0.7) return '#ffeb3b'; // Yellow
      if (value < 0.9) return '#ff9800'; // Orange
      return '#f44336'; // Red
    } else {
      // Drug kill: higher is better (more cells killed) - green for high, red for low
      if (value > 70) return '#4caf50'; // Green
      if (value > 50) return '#8bc34a'; // Light green
      if (value > 30) return '#ffeb3b'; // Yellow
      if (value > 10) return '#ff9800'; // Orange
      return '#f44336'; // Red
    }
  };

  const downloadCSV = (data: CSVDataResponse, filename: string) => {
    if (data.type !== 'drug_response') return;

    const { drug_names = [], cells = [], values = [] } = data;

    // Create CSV content
    let csvContent = 'Drug Name,' + cells.join(',') + '\n';
    drug_names.forEach((drugName, drugIndex) => {
      const row = [drugName, ...cells.map((_, cellIndex) => values[cellIndex]?.[drugIndex] || 0)];
      csvContent += row.join(',') + '\n';
    });

    // Download
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (loading) {
    return (
      <Card>
        <CardContent>
          <Box display="flex" justifyContent="center" alignItems="center" p={4}>
            <CircularProgress />
          </Box>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent>
          <Alert severity="error">{error}</Alert>
        </CardContent>
      </Card>
    );
  }

  if (!ic50File && !drugKillFile) {
    return (
      <Card>
        <CardContent>
          <Alert severity="info">No drug response CSV data available</Alert>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent>
        <Stack spacing={2}>
          <Box display="flex" justifyContent="space-between" alignItems="center">
            <Typography variant="h6">Drug Response Predictions</Typography>
            <Tooltip title="Download CSV">
              <IconButton
                onClick={() => {
                  if (currentData) {
                    const filename = currentTab === 0 ? 'IC50_prediction.csv' : 'drug_kill_prediction.csv';
                    downloadCSV(currentData, filename);
                  }
                }}
                disabled={!currentData}
              >
                <DownloadIcon />
              </IconButton>
            </Tooltip>
          </Box>

          <Tabs value={currentTab} onChange={(_, newValue) => setCurrentTab(newValue)}>
            {ic50File && <Tab label="IC50 Predictions" />}
            {drugKillFile && <Tab label="Drug Kill Predictions" />}
          </Tabs>

          <TextField
            label="Search drugs"
            variant="outlined"
            size="small"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            fullWidth
          />

          {ic50File && (
            <TabPanel value={currentTab} index={0}>
              {processedData && (
                <>
                  <Typography variant="body2" color="text.secondary" gutterBottom>
                    Showing {processedData.drugRows.length} drugs × {processedData.cells.length} cell populations
                    <br />
                    IC50 values: Lower values indicate higher drug sensitivity (better response)
                  </Typography>
                  <TableContainer component={Paper} sx={{ maxHeight: 600 }}>
                    <Table stickyHeader size="small">
                      <TableHead>
                        <TableRow>
                          <TableCell><strong>Drug Name</strong></TableCell>
                          {processedData.cells.map((cell, idx) => (
                            <TableCell key={idx} align="center">
                              <TableSortLabel
                                active={sortColumn === idx}
                                direction={sortColumn === idx ? sortDirection : 'desc'}
                                onClick={() => handleSort(idx)}
                              >
                                <strong>{cell}</strong>
                              </TableSortLabel>
                            </TableCell>
                          ))}
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {processedData.drugRows.map((row, rowIdx) => (
                          <TableRow key={rowIdx} hover>
                            <TableCell>{row.drugName}</TableCell>
                            {row.cellValues.map((value, cellIdx) => (
                              <TableCell
                                key={cellIdx}
                                align="center"
                                sx={{
                                  backgroundColor: getCellColor(value, true),
                                  color: value < 0.5 || value > 0.7 ? 'white' : 'black',
                                  fontWeight: 'bold',
                                }}
                              >
                                {value.toFixed(3)}
                              </TableCell>
                            ))}
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </TableContainer>
                </>
              )}
            </TabPanel>
          )}

          {drugKillFile && (
            <TabPanel value={currentTab} index={ic50File ? 1 : 0}>
              {processedData && (
                <>
                  <Typography variant="body2" color="text.secondary" gutterBottom>
                    Showing {processedData.drugRows.length} drugs × {processedData.cells.length} cell populations
                    <br />
                    Drug Kill %: Higher values indicate more effective cell killing
                  </Typography>
                  <TableContainer component={Paper} sx={{ maxHeight: 600 }}>
                    <Table stickyHeader size="small">
                      <TableHead>
                        <TableRow>
                          <TableCell><strong>Drug Name</strong></TableCell>
                          {processedData.cells.map((cell, idx) => (
                            <TableCell key={idx} align="center">
                              <TableSortLabel
                                active={sortColumn === idx}
                                direction={sortColumn === idx ? sortDirection : 'desc'}
                                onClick={() => handleSort(idx)}
                              >
                                <strong>{cell}</strong>
                              </TableSortLabel>
                            </TableCell>
                          ))}
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {processedData.drugRows.map((row, rowIdx) => (
                          <TableRow key={rowIdx} hover>
                            <TableCell>{row.drugName}</TableCell>
                            {row.cellValues.map((value, cellIdx) => (
                              <TableCell
                                key={cellIdx}
                                align="center"
                                sx={{
                                  backgroundColor: getCellColor(value, false),
                                  color: value < 30 || value > 70 ? 'white' : 'black',
                                  fontWeight: 'bold',
                                }}
                              >
                                {value.toFixed(1)}%
                              </TableCell>
                            ))}
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </TableContainer>
                </>
              )}
            </TabPanel>
          )}
        </Stack>
      </CardContent>
    </Card>
  );
};

export default DrugResponseTable;
