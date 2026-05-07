# Container image for the per-user Sandbox Durable Object that backs the
# chat agent's runBash tool. The base image is published by Cloudflare
# and ships Python 3, Node.js, and an HTTP control plane the @cloudflare/
# sandbox SDK speaks to. Pin the version explicitly; bump when upgrading
# the @cloudflare/sandbox npm package so they stay in lockstep.
FROM docker.io/cloudflare/sandbox:0.9.4-python

RUN apt-get update \
	&& apt-get install -y --no-install-recommends ripgrep jq file unzip \
	&& rm -rf /var/lib/apt/lists/*

RUN python3 -m pip install --no-cache-dir --break-system-packages \
	pypdf \
	pdfplumber \
	beautifulsoup4 \
	lxml \
	pillow \
	pandas \
	openpyxl \
	python-docx \
	rapidfuzz

# Standard documentation directive — the base image listens on this port.
EXPOSE 8080
