FROM --platform=linux/amd64 ubuntu:22.04

# Install basic system dependencies
RUN apt-get update && apt-get install -y \
    wget \
    curl \
    git \
    build-essential \
    libgl1-mesa-glx \
    && rm -rf /var/lib/apt/lists/*

# Install Miniconda
RUN wget https://repo.anaconda.com/miniconda/Miniconda3-latest-Linux-x86_64.sh -O miniconda.sh && \
    bash miniconda.sh -b -p /opt/conda && \
    rm miniconda.sh

# Add conda to path
ENV PATH="/opt/conda/bin:${PATH}"

# Create mount points
RUN mkdir -p /workspace /data /reference

# Install Cell Ranger
WORKDIR /opt
COPY cellranger-8.0.1.tar.gz .
RUN tar -xzvf cellranger-8.0.1.tar.gz && \
    rm cellranger-8.0.1.tar.gz

# Add Cell Ranger to PATH
ENV PATH="/opt/cellranger-8.0.1:${PATH}"

# Set working directory back to workspace
WORKDIR /workspace

# Initialize conda in bash
RUN conda init bash

# Copy environment file
COPY environment.yml .

# Create conda environment
RUN conda env create -f environment.yml

# Add conda environment activation to bash startup
RUN echo "conda activate scrnaseq1" >> ~/.bashrc

# Set default command
CMD ["/bin/bash"]