FROM python:3.12-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1 \
    INLINE_WORKER=true WORKER_POLL_SECONDS=30 DATA_DIR=/tmp/pitchgrill PORT=8000
WORKDIR /app
COPY backend/requirements.lock /app/requirements.lock
RUN pip install -r requirements.lock && useradd --uid 1000 --create-home app
COPY --chown=app:app backend /app/backend
USER app
EXPOSE 8000
CMD ["python", "-m", "backend.hosted"]
