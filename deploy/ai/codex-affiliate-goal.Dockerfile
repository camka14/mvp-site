FROM node:22-bookworm-slim

ARG CODEX_VERSION=0.146.0
ARG CODEX_UID=1000
ARG CODEX_GID=1000

RUN apt-get update \
  && apt-get install --no-install-recommends -y \
    ca-certificates \
    curl \
    git \
    imagemagick \
    jq \
    openssl \
    procps \
  && rm -rf /var/lib/apt/lists/* \
  && npm install --global "@openai/codex@${CODEX_VERSION}" \
  && groupadd --gid "${CODEX_GID}" codex \
  && useradd --uid "${CODEX_UID}" --gid "${CODEX_GID}" \
    --create-home --home-dir /home/codex codex

ENV HOME=/home/codex \
  PATH=/usr/local/bin:/usr/bin:/bin

WORKDIR /workspace
USER codex

CMD ["bash"]
