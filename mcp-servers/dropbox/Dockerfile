FROM python:3.11-slim

WORKDIR /app

# Install system dependencies for PyMuPDF
RUN apt-get update && apt-get install -y --no-install-recommends \
    libmupdf-dev \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY server.py .

ENV MCP_SERVER_PORT=3015
ENV DROPBOX_ACCESS_TOKEN=""
ENV DROPBOX_REFRESH_TOKEN=""
ENV DROPBOX_APP_KEY=""
ENV DROPBOX_APP_SECRET=""

EXPOSE 3015

CMD ["python", "server.py"]
