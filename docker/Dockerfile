FROM texlive/texlive:latest

# Install Node.js 20 LTS
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    && curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y nodejs \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy the bundled server (built by: npm run build:server)
COPY dist/server.cjs ./server.cjs

# Non-root user for security
RUN useradd -r -s /bin/false platex && chown platex:platex /app
USER platex

EXPOSE 3001
ENV NODE_ENV=production
ENV PORT=3001

HEALTHCHECK --interval=30s --timeout=10s --start-period=5s \
  CMD curl -f http://localhost:${PORT}/health || exit 1

CMD ["node", "server.cjs"]
