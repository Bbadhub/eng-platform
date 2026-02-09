FROM node:20-alpine

WORKDIR /app

# Copy package.json first for dependency caching
COPY package.json .

# Install dependencies (including openai for DeepSeek API)
RUN npm install --production

# Copy server files
COPY legalai-research-server.js .
COPY legalai-integration.js .
COPY circuit-breaker.js .
COPY formula-engine.js .
COPY mode-router.js .
COPY entity-extraction.js .
COPY confidence-calculator.js .

# Create data directory for patterns
RUN mkdir -p /app/data

# Environment variables
ENV PORT=3012
ENV NODE_ENV=production

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD wget -q --spider http://localhost:3012/health || exit 1

# Expose port
EXPOSE 3012

# Run server
CMD ["node", "legalai-research-server.js"]
