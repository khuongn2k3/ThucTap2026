FROM nvidia/cuda:12.1.0-cudnn8-runtime-ubuntu22.04

WORKDIR /app

RUN apt-get update && apt-get install -y \
    python3.10 \
    python3-pip \
    git \
    ffmpeg \
    libgl1 \
    libglib2.0-0 \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt /app/requirements.txt

RUN python3.10 -m pip install --upgrade pip \
 && python3.10 -m pip install --no-cache-dir -r /app/requirements.txt

# copy toàn bộ source
COPY . /app

WORKDIR /app/backend-python

CMD ["python3.10", "main.py"]
