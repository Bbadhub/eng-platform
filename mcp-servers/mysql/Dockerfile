FROM python:3.11-slim

WORKDIR /app

# Install dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy source
COPY server.py .

# Environment
ENV PYTHONUNBUFFERED=1
ENV MYSQL_HOST="ragflow-mysql"
ENV MYSQL_PORT=3306
ENV MYSQL_USER="root"
ENV MYSQL_PASSWORD=""
ENV MYSQL_DATABASE="ragflow"
ENV MCP_SERVER_PORT=3012

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
    CMD python -c "import httpx; httpx.get('http://localhost:3012/health').raise_for_status()" || exit 1

# Run MCP server
CMD ["python", "server.py"]
