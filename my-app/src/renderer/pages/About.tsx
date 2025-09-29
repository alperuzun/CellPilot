import React from 'react';
import { 
  Box, 
  Typography, 
  Card, 
  CardContent, 
  Divider, 
  Chip,
  Stack,
  Link
} from '@mui/material';
import { 
  Science, 
  Code, 
  Analytics, 
  Groups,
  GitHub,
  Email
} from '@mui/icons-material';

export default function About() {
  return (
    <Box sx={{ p: 3, maxWidth: 1000, mx: 'auto' }}>
      {/* Header Section */}
      <Box sx={{ textAlign: 'center', mb: 4 }}>
        <Typography variant="h3" component="h1" gutterBottom color="primary">
          About CellPilot
        </Typography>
        <Typography variant="h6" color="text.secondary" sx={{ mb: 2 }}>
          Advancing Single-Cell Analysis Through Intelligent Automation
        </Typography>
        <Chip 
          label="Version 1.0.0" 
          color="primary" 
          variant="outlined" 
          sx={{ fontSize: '0.875rem' }}
        />
      </Box>

      <Stack spacing={3}>
        {/* Mission Statement */}
        <Card elevation={2}>
          <CardContent>
            <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
              <Science sx={{ mr: 1, color: 'primary.main' }} />
              <Typography variant="h5" component="h2">
                Our Mission
              </Typography>
            </Box>
            <Typography variant="body1" paragraph>
              CellPilot is dedicated to democratizing single-cell RNA sequencing analysis by providing 
              researchers with an intuitive, comprehensive platform that bridges the gap between complex 
              computational biology and accessible scientific discovery.
            </Typography>
            <Typography variant="body1">
              We believe that every researcher should have access to state-of-the-art analytical tools 
              without requiring extensive bioinformatics expertise, enabling them to focus on what matters 
              most: making groundbreaking discoveries that advance our understanding of cellular biology.
            </Typography>
          </CardContent>
        </Card>

        {/* Key Features */}
        <Card elevation={2}>
          <CardContent>
            <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
              <Analytics sx={{ mr: 1, color: 'primary.main' }} />
              <Typography variant="h5" component="h2">
                Core Capabilities
              </Typography>
            </Box>
            <Stack spacing={2}>
              <Box>
                <Typography variant="h6" color="primary">
                  🧬 Intelligent Cell Annotation
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Automated cell type identification using curated reference databases including 
                  CellMarker, PanglaoDB, and Cancer Single Cell Atlas
                </Typography>
              </Box>
              <Box>
                <Typography variant="h6" color="primary">
                  🔗 Cell Communication Networks
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Advanced ligand-receptor interaction analysis powered by CellPhoneDB to reveal 
                  intercellular communication patterns
                </Typography>
              </Box>
              <Box>
                <Typography variant="h6" color="primary">
                  🎯 Drug Response Prediction
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Integrated CaDRReS-Sc modeling for personalized drug sensitivity predictions 
                  and therapeutic target identification
                </Typography>
              </Box>
              <Box>
                <Typography variant="h6" color="primary">
                  🧪 Tumor Microenvironment Analysis
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Copy number variation detection and malignant cell identification using 
                  state-of-the-art inferCNV algorithms
                </Typography>
              </Box>
            </Stack>
          </CardContent>
        </Card>

        {/* Technology Stack */}
        <Card elevation={2}>
          <CardContent>
            <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
              <Code sx={{ mr: 1, color: 'primary.main' }} />
              <Typography variant="h5" component="h2">
                Technology Foundation
              </Typography>
            </Box>
            <Typography variant="body1" paragraph>
              CellPilot is built on a robust foundation of cutting-edge technologies and established 
              scientific frameworks:
            </Typography>
            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap sx={{ mb: 2 }}>
              <Chip label="Python" size="small" />
              <Chip label="React" size="small" />
              <Chip label="TypeScript" size="small" />
              <Chip label="Electron" size="small" />
              <Chip label="FastAPI" size="small" />
              <Chip label="TensorFlow" size="small" />
              <Chip label="Scanpy" size="small" />
              <Chip label="Material-UI" size="small" />
            </Stack>
            <Typography variant="body2" color="text.secondary">
              Our cross-platform desktop application ensures consistent performance across Windows, 
              macOS, and Linux environments while maintaining the flexibility of modern web technologies.
            </Typography>
          </CardContent>
        </Card>

        {/* Team */}
        <Card elevation={2}>
          <CardContent>
            <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
              <Groups sx={{ mr: 1, color: 'primary.main' }} />
              <Typography variant="h5" component="h2">
                Development Team
              </Typography>
            </Box>
            <Typography variant="body1" paragraph>
              CellPilot is developed by a passionate team of computational biologists, software engineers, 
              and data scientists committed to advancing single-cell research through innovative software solutions.
            </Typography>
            <Typography variant="body1">
              Our interdisciplinary approach combines deep domain expertise in cellular biology with 
              modern software engineering practices to deliver tools that meet the evolving needs of 
              the research community.
            </Typography>
          </CardContent>
        </Card>

        {/* Contact & Support */}
        <Card elevation={2}>
          <CardContent>
            <Typography variant="h5" component="h2" gutterBottom>
              Get Involved
            </Typography>
            <Stack spacing={2}>
              <Box>
                <Typography variant="body1" paragraph>
                  We welcome contributions, feedback, and collaboration opportunities from the scientific community.
                </Typography>
              </Box>
              <Divider />
              <Stack direction="row" spacing={3} alignItems="center">
                <Box sx={{ display: 'flex', alignItems: 'center' }}>
                  <GitHub sx={{ mr: 1, color: 'text.secondary' }} />
                  <Link href="#" color="primary">
                    GitHub Repository
                  </Link>
                </Box>
                <Box sx={{ display: 'flex', alignItems: 'center' }}>
                  <Email sx={{ mr: 1, color: 'text.secondary' }} />
                  <Link href="mailto:support@cellpilot.org" color="primary">
                    Contact Support
                  </Link>
                </Box>
              </Stack>
            </Stack>
          </CardContent>
        </Card>

        {/* Footer */}
        <Box sx={{ textAlign: 'center', pt: 2 }}>
          <Typography variant="body2" color="text.secondary">
            © 2025 CellPilot Development Team. Open source software for the scientific community.
          </Typography>
        </Box>
      </Stack>
    </Box>
  );
}