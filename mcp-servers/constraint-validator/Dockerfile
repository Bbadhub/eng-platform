FROM python:3.11-slim

WORKDIR /app

# Install build dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    g++ \
    build-essential \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Install dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy source
COPY server.py .
COPY z3_validator.py .
COPY constraint_extractor.py .
COPY authority_model.py .

# Environment
ENV PYTHONUNBUFFERED=1
ENV LITELLM_URL=""
ENV LITELLM_API_KEY=""
ENV MCP_SERVER_PORT=9385

# Expose port
EXPOSE 9385

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:9385/health || exit 1

# Run MCP server
CMD ["python", "server.py"]
