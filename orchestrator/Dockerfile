FROM node:22-bookworm-slim AS build

WORKDIR /app

COPY package.json package-lock.json tsconfig.json ./
COPY src ./src
RUN npm ci && npm run build

FROM node:22-bookworm-slim AS runner

ARG CLAYERS_VERSION=0.2.1
ENV HOST=0.0.0.0
ENV PORT=8787
ENV CLAYERS_ORCHESTRATOR_ALLOW_LOCAL_PATHS=0
ENV CLAYERS_BIN=/opt/clayers/bin/clayers

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates git python3 python3-venv \
  && rm -rf /var/lib/apt/lists/*

RUN python3 -m venv /opt/clayers \
  && /opt/clayers/bin/python -m pip install --upgrade pip \
  && /opt/clayers/bin/python -m pip install "clayers==${CLAYERS_VERSION}"

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY --from=build /app/dist ./dist

EXPOSE 8787
CMD ["node", "dist/server.js"]
