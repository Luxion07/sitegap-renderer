# -----------------------------------------------------------------------------
# Stage 1: Build application artifacts
# -----------------------------------------------------------------------------
FROM node:22-bookworm-slim AS builder

WORKDIR /app

# Enable pnpm
RUN corepack enable && corepack prepare pnpm@11.9.0 --activate

# Copy dependency definitions
COPY package.json pnpm-lock.yaml .npmrc ./

# Install all dependencies (including devDependencies for compilation)
RUN pnpm install --frozen-lockfile --ignore-scripts

# Copy configuration, source code, and proto files
COPY tsconfig.json nest-cli.json ./
COPY proto/ ./proto/
COPY src/ ./src/

# Compile TypeScript to dist/
RUN pnpm build

# Prune devDependencies to keep only production dependencies
RUN pnpm prune --prod --ignore-scripts

# -----------------------------------------------------------------------------
# Stage 2: Production runtime with Playwright Chromium
# -----------------------------------------------------------------------------
FROM mcr.microsoft.com/playwright:v1.64.1-noble AS runner

# Install tini for zombie process reaping
RUN apt-get update && \
    apt-get install -y --no-install-recommends tini && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Configure app directory permissions for non-root pwuser
RUN chown -R pwuser:pwuser /app

# Copy production dependencies, build output, and proto definitions
COPY --chown=pwuser:pwuser --from=builder /app/node_modules ./node_modules
COPY --chown=pwuser:pwuser --from=builder /app/dist ./dist
COPY --chown=pwuser:pwuser --from=builder /app/proto ./proto
COPY --chown=pwuser:pwuser package.json ./
COPY --chown=pwuser:pwuser scripts/healthcheck.js ./scripts/healthcheck.js

# Switch to unprivileged non-root user
USER pwuser

# Default runtime configuration
ENV NODE_ENV=production \
    PORT=50051 \
    RENDERER_ADDRESS=0.0.0.0:50051 \
    RENDERER_SLOTS=2 \
    RENDERER_MAX_RENDER_MS=20000

# Expose gRPC port
EXPOSE 50051

# Health check using gRPC Health service
HEALTHCHECK --interval=10s --timeout=5s --start-period=10s --retries=3 \
  CMD node scripts/healthcheck.js

# Use tini as the init process
ENTRYPOINT ["/usr/bin/tini", "--"]

# Run the NestJS gRPC server
CMD ["node", "dist/main.js"]
