FROM python:3.11-slim

# Prevent interactive prompts during package installs
ENV DEBIAN_FRONTEND=noninteractive
ENV PYTHONUNBUFFERED=1

# Install the exact X11, OpenGL, and runtime libraries required by bpy
RUN apt-get update && apt-get install -y --no-install-recommends \
    libx11-6 \
    libxxf86vm1 \
    libxfixes3 \
    libxi6 \
    libxrender1 \
    libxkbcommon0 \
    libgl1 \
    libglu1-mesa \
    libsm6 \
    libice6 \
    zlib1g \
    && rm -rf /var/lib/apt/lists/*

RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir bpy fastapi uvicorn[standard] websockets

WORKDIR /app

# Default command
CMD ["python", "script.py"]
