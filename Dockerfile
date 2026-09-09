FROM python:3.10-slim

# Set working directory
WORKDIR /app

# Prevent python from buffering stdout/stderr
ENV PYTHONUNBUFFERED=1

# Install CPU-only PyTorch and python dependencies to keep image size small
COPY backend/requirements.txt ./backend/
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r backend/requirements.txt --extra-index-url https://download.pytorch.org/whl/cpu && \
    pip install --no-cache-dir gunicorn

# Copy backend (including trained model) and frontend
COPY backend/ ./backend/
COPY frontend/ ./frontend/

WORKDIR /app/backend

# Default port (Hugging Face Spaces uses 7860; Render/Railway set $PORT)
ENV PORT=7860
EXPOSE 7860

# Run with Gunicorn using 1 worker and multiple threads (keeps RAM usage low for ML models)
CMD ["sh", "-c", "gunicorn --bind 0.0.0.0:${PORT:-7860} --workers 1 --threads 4 --timeout 120 app:app"]
