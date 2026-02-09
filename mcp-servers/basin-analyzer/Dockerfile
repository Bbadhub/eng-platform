FROM python:3.11-slim

WORKDIR /app

# Install build dependencies for hdbscan/numpy
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    g++ \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Install dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy source
COPY server.py .
COPY analyzer.py .

# Environment
ENV PYTHONUNBUFFERED=1
ENV VOYAGE_API_KEY=""
ENV DEEPSEEK_API_KEY=""

# Run MCP server
CMD ["python", "server.py"]
