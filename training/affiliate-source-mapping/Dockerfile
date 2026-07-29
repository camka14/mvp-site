# syntax=docker/dockerfile:1.7

# Supply a digest-pinned CUDA 12.8 development image at build time:
# --build-arg TRAINING_BASE_IMAGE=nvidia/cuda:<tag>@sha256:<digest>
ARG TRAINING_BASE_IMAGE
FROM ${TRAINING_BASE_IMAGE}

ENV DEBIAN_FRONTEND=noninteractive \
  HF_HUB_OFFLINE=1 \
  TRANSFORMERS_OFFLINE=1 \
  HF_DATASETS_OFFLINE=1 \
  WANDB_DISABLED=true \
  PYTHONUNBUFFERED=1
WORKDIR /workspace/training/affiliate-source-mapping

RUN apt-get update \
  && apt-get install --no-install-recommends -y ca-certificates git python3 python3-pip \
  && rm -rf /var/lib/apt/lists/*

COPY training/affiliate-source-mapping/requirements.lock ./requirements.lock
RUN python3 -m pip install --break-system-packages --no-cache-dir -r requirements.lock

COPY training/affiliate-source-mapping ./

ENTRYPOINT ["python3", "train_lora.py"]
