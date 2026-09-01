# --- Basic Dockerfile for the Geo-Food FastAPI WebSocket service ---

# 1. Start from a small official Python image (no OS bloat, faster pulls/builds)
FROM python:3.11-slim

# 2. Set the working directory inside the container — all following
#    commands run relative to this path, and it's where our code will live
WORKDIR /app

# 3. Environment tweaks:
#    PYTHONUNBUFFERED=1 -> print()/logging output shows up immediately in
#    `docker logs` instead of being buffered
#    PIP_NO_CACHE_DIR=1 -> keeps the image smaller by not caching pip downloads
ENV PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

# 4. Copy ONLY the requirements file first (before the rest of the code).
#    Docker caches layers — if requirements.txt hasn't changed, Docker
#    reuses the cached "pip install" layer instead of redoing it every
#    time you rebuild after a code change. This makes rebuilds much faster.
COPY requirements.txt .
RUN pip install -r requirements.txt

# 5. Now copy the actual application source files
COPY api.py final.py nlp_layer.py Phase_2.py ./

# 6. Document which port the app listens on (informational — you still
#    need to publish it with `-p` when running the container)
EXPOSE 8000

# 7. The command that runs when the container starts:
#    launch the FastAPI app ("api.py" -> the "app" object) with uvicorn,
#    bound to 0.0.0.0 so it's reachable from outside the container.
CMD ["uvicorn", "api:app", "--host", "0.0.0.0", "--port", "8000"]
