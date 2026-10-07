FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    CLIENTIFY_DB=/data/clientify.db

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt gunicorn

COPY . .

EXPOSE 8000
# --preload: init_db() corre una sola vez en el proceso maestro, no en cada worker
CMD ["gunicorn", "--preload", "-w", "2", "-b", "0.0.0.0:8000", "app:app"]
