import React from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  BarElement,
} from 'chart.js';
import { Bar } from 'react-chartjs-2';
import type { QCMetricsResponse } from '../types/backend';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  BarElement
);

interface QCPlotsVisualizationProps {
  qcMetrics: QCMetricsResponse;
  minGenesPerCell: number;
  maxGenesPerCell: number;
  minCounts: number;
  maxCounts: number;
  maxMitoPercent: number;
}

export default function QCPlotsVisualization({
  qcMetrics,
  minGenesPerCell,
  maxGenesPerCell,
  minCounts,
  maxCounts,
  maxMitoPercent
}: QCPlotsVisualizationProps) {

  // Create histogram data for genes per cell
  const createHistogramData = (values: number[], bins = 50) => {
    const min = Math.min(...values);
    const max = Math.max(...values);
    const binWidth = (max - min) / bins;
    const binCounts = new Array(bins).fill(0);
    const binLabels = [];

    for (let i = 0; i < bins; i++) {
      binLabels.push(Math.round(min + i * binWidth));
    }

    values.forEach(value => {
      const binIndex = Math.min(Math.floor((value - min) / binWidth), bins - 1);
      binCounts[binIndex]++;
    });

    return { labels: binLabels, counts: binCounts };
  };

  const genesHistogram = createHistogramData(qcMetrics.n_genes_by_counts);
  const countsHistogram = createHistogramData(qcMetrics.total_counts);
  const mitoHistogram = createHistogramData(qcMetrics.pct_counts_mt);

  const genesChartData = {
    labels: genesHistogram.labels,
    datasets: [
      {
        label: 'Number of Cells',
        data: genesHistogram.counts,
        backgroundColor: 'rgba(59, 130, 246, 0.5)',
        borderColor: 'rgb(59, 130, 246)',
        borderWidth: 1,
      },
    ],
  };

  const countsChartData = {
    labels: countsHistogram.labels,
    datasets: [
      {
        label: 'Number of Cells',
        data: countsHistogram.counts,
        backgroundColor: 'rgba(16, 185, 129, 0.5)',
        borderColor: 'rgb(16, 185, 129)',
        borderWidth: 1,
      },
    ],
  };

  const mitoChartData = {
    labels: mitoHistogram.labels,
    datasets: [
      {
        label: 'Number of Cells',
        data: mitoHistogram.counts,
        backgroundColor: 'rgba(239, 68, 68, 0.5)',
        borderColor: 'rgb(239, 68, 68)',
        borderWidth: 1,
      },
    ],
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: false,
      },
      tooltip: {
        mode: 'index' as const,
        intersect: false,
      },
    },
    scales: {
      x: {
        display: true,
        title: {
          display: true,
          text: 'Value',
        },
      },
      y: {
        display: true,
        title: {
          display: true,
          text: 'Cell Count',
        },
      },
    },
  };

  const genesOptionsWithThresholds = {
    ...chartOptions,
    scales: {
      ...chartOptions.scales,
      x: {
        ...chartOptions.scales.x,
        title: {
          display: true,
          text: 'Genes per Cell',
        },
      },
    },
    plugins: {
      ...chartOptions.plugins,
      annotation: {
        annotations: {
          minLine: {
            type: 'line' as const,
            xMin: minGenesPerCell,
            xMax: minGenesPerCell,
            borderColor: 'red',
            borderWidth: 2,
            label: {
              content: `Min: ${minGenesPerCell}`,
              enabled: true,
              position: 'start' as const,
            },
          },
          maxLine: {
            type: 'line' as const,
            xMin: maxGenesPerCell,
            xMax: maxGenesPerCell,
            borderColor: 'red',
            borderWidth: 2,
            label: {
              content: `Max: ${maxGenesPerCell}`,
              enabled: true,
              position: 'start' as const,
            },
          },
        },
      },
    },
  };

  const countsOptionsWithThresholds = {
    ...chartOptions,
    scales: {
      ...chartOptions.scales,
      x: {
        ...chartOptions.scales.x,
        title: {
          display: true,
          text: 'UMI Counts per Cell',
        },
      },
    },
  };

  const mitoOptionsWithThresholds = {
    ...chartOptions,
    scales: {
      ...chartOptions.scales,
      x: {
        ...chartOptions.scales.x,
        title: {
          display: true,
          text: 'Mitochondrial %',
        },
      },
    },
  };

  return (
    <div className="h-[500px] flex flex-col gap-4">
      {/* Genes per Cell Plot */}
      <div className="flex-1 p-4 bg-white border border-gray-200 rounded-lg">
        <h3 className="text-sm font-medium text-gray-700 mb-2">
          Genes per Cell Distribution
        </h3>
        <div className="h-24">
          <Bar data={genesChartData} options={genesOptionsWithThresholds} />
        </div>
        <div className="mt-2 text-xs text-gray-500">
          <p>Filter range: {minGenesPerCell} - {maxGenesPerCell} genes</p>
          <p>Mean: {qcMetrics.stats.mean_genes.toFixed(0)} | Median: {qcMetrics.stats.median_genes.toFixed(0)}</p>
        </div>
      </div>

      {/* UMI Counts Plot */}
      <div className="flex-1 p-4 bg-white border border-gray-200 rounded-lg">
        <h3 className="text-sm font-medium text-gray-700 mb-2">
          UMI Counts per Cell Distribution
        </h3>
        <div className="h-24">
          <Bar data={countsChartData} options={countsOptionsWithThresholds} />
        </div>
        <div className="mt-2 text-xs text-gray-500">
          <p>Filter range: {minCounts.toLocaleString()} - {maxCounts.toLocaleString()} counts</p>
          <p>Mean: {qcMetrics.stats.mean_counts.toFixed(0)} | Median: {qcMetrics.stats.median_counts.toFixed(0)}</p>
        </div>
      </div>

      {/* Mitochondrial Percentage Plot */}
      <div className="flex-1 p-4 bg-white border border-gray-200 rounded-lg">
        <h3 className="text-sm font-medium text-gray-700 mb-2">
          Mitochondrial Gene Percentage Distribution
        </h3>
        <div className="h-24">
          <Bar data={mitoChartData} options={mitoOptionsWithThresholds} />
        </div>
        <div className="mt-2 text-xs text-gray-500">
          <p>Max threshold: {maxMitoPercent}%</p>
          <p>Mean: {qcMetrics.stats.mean_mt_pct.toFixed(1)}% | Median: {qcMetrics.stats.median_mt_pct.toFixed(1)}%</p>
        </div>
      </div>
    </div>
  );
}