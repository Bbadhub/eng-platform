FROM python:3.11-slim

WORKDIR /app

# Install dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy source
COPY server.py .

# Environment
ENV PYTHONUNBUFFERED=1
ENV POSTGREST_URL="http://178.156.192.12:3001"
ENV MCP_SERVER_PORT=3011

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD python -c "import httpx; httpx.get('http://localhost:3011/health').raise_for_status()" || exit 1

# Run MCP server
CMD ["python", "server.py"]
