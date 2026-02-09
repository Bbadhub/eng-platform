FROM python:3.11-slim

WORKDIR /app

# Install system dependencies for PDF generation
RUN apt-get update && apt-get install -y --no-install-recommends \
    pandoc \
    texlive-xetex \
    texlive-fonts-recommended \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy source
COPY server.py .

# Create directories
RUN mkdir -p /data/reports /templates

# Environment
ENV PYTHONUNBUFFERED=1
ENV MCP_SERVER_PORT=3015
ENV REPORTS_OUTPUT_DIR=/data/reports
ENV TEMPLATES_DIR=/templates

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD python -c "import httpx; httpx.get('http://localhost:3015/health').raise_for_status()" || exit 1

# Run MCP server
CMD ["python", "server.py"]
