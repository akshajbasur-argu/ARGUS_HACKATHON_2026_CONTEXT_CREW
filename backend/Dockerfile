FROM python:3.11-slim

# System deps for psycopg2 / python-magic
RUN apt-get update && apt-get install -y --no-install-recommends \
    libmagic1 \
    gcc \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Source is mounted as a volume in dev; copy in production builds
COPY . .

# Create media directory
RUN mkdir -p /app/media

EXPOSE 8000

# Default: API server. Override in docker-compose for worker.
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
