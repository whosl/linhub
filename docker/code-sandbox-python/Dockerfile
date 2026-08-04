FROM python:3.12-slim@sha256:c3d81d25b3154142b0b42eb1e61300024426268edeb5b5a26dd7ddf64d9daf28

ARG PIP_INDEX_URL=https://pypi.org/simple

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PIP_NO_CACHE_DIR=1 \
    MPLCONFIGDIR=/tmp/matplotlib \
    PYTHONPATH=/opt/linhub

COPY requirements.txt /tmp/requirements.txt
COPY linhub_safe_archive.py /opt/linhub/linhub_safe_archive.py
RUN python -m pip install --no-cache-dir --index-url "${PIP_INDEX_URL}" --requirement /tmp/requirements.txt \
    && rm /tmp/requirements.txt \
    && python -c "import duckdb, linhub_safe_archive, matplotlib, numpy, openpyxl, pandas, polars, pyarrow, scipy, seaborn, sklearn, xlsxwriter" \
    && rm -rf /tmp/matplotlib

USER 65532:65532
