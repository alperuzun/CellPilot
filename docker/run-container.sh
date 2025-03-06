#!/bin/bash

# Create directories if they don't exist
mkdir -p data reference

if [[ "$OSTYPE" == "darwin"* ]]; then
    # Get IP address for Mac
    export IP=$(ifconfig en0 | grep inet | awk '$1=="inet" {print $2}')
    
    # Start XQuartz if not running
    if ! ps aux | grep XQuartz | grep -v grep > /dev/null; then
        open -a XQuartz
        sleep 3
    fi
    
    # Allow connections from localhost
    xhost + $IP
    
    # MacOS specific setup
    podman run -it \
        -e DISPLAY=$IP:0 \
        -v "$(pwd)":/workspace:Z \
        -v "$(pwd)/data":/data:Z \
        -v "$(pwd)/reference":/reference:Z \
        --workdir /workspace \
        scrnaseq
else
    # Linux setup
    podman run -it \
        --net=host \
        -e DISPLAY=$DISPLAY \
        -v /tmp/.X11-unix:/tmp/.X11-unix:Z \
        -v "$HOME/.Xauthority:/root/.Xauthority:Z" \
        -v "$(pwd)":/workspace:Z \
        -v "$(pwd)/data":/data:Z \
        -v "$(pwd)/reference":/reference:Z \
        --workdir /workspace \
        scrnaseq
fi