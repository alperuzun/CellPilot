# Single Cell RNA-seq Analysis Pipeline

A GUI tool for running single-cell RNA-seq analysis using Cell Ranger.

## Recommended Setup (Server Usage)
For research and production analysis.

1. Connect to your analysis server:
```bash
ssh username@server
```

2. Clone the repository:
```bash
git clone <repository-url>
cd SingleCell
```

3. Create conda environment:
```bash
conda env create -f environment.yml
conda activate scrnaseq1
```

4. Download and install Cell Ranger:
```bash
# Download from 10x Genomics website
wget -O cellranger-8.0.1.tar.gz "YOUR_DOWNLOAD_URL"
tar -xzvf cellranger-8.0.1.tar.gz

# Add to your ~/.bashrc
echo 'export PATH=$PATH:$PWD/cellranger-8.0.1' >> ~/.bashrc
source ~/.bashrc
```

5. Run the GUI:
```bash
# If using X11 forwarding
ssh -X username@server
python gui_main.py

# Or use tmux for long-running sessions
tmux new -s scrnaseq
python gui_main.py
```

## Data Organization
```
SingleCell/
├── data/           # FASTQ files and outputs
│   └── sample1/    # Each sample in its own directory
├── reference/      # Reference genome files
└── results/        # Analysis results
```


## Alternative Setup (Local Development)
For testing and development only. Not recommended for production analysis.

### Local Usage (Mac M1/M2)
- Miniconda/Anaconda
- Podman (for container support)
- XQuartz (for GUI)
- At least 16GB RAM
- Note: Cell Ranger will not work locally on M1/M2 Macs due to CPU compatibility

## Setup Options

### Option 2: Containerized Usage
Best for development and testing.

1. Install prerequisites:
```bash
# On Mac
brew install podman
brew install --cask xquartz

# On Linux
sudo apt-get install podman
```

2. Clone repository:
```bash
git clone <repository-url>
cd SingleCell
```

3. Place Cell Ranger in repository:
- Download cellranger-8.0.1.tar.gz from 10x Genomics
- Place in repository root directory

4. Build container:
```bash
chmod +x docker/build.sh
./docker/build.sh
```

5. Configure XQuartz (Mac only):
- Open XQuartz
- Go to Preferences > Security
- Check "Allow connections from network clients"
- Restart XQuartz

6. Run container:
```bash
chmod +x docker/run-container.sh
./docker/run-container.sh
```