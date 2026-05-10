# Reschematic share backend + editor.
#
# Deploys the Express server, which serves both:
#   - /             — the editor (project root)
#   - /api/share    — POST snapshot uploads
#   - /view/:id     — password-gated viewer

FROM node:20-alpine AS deps
WORKDIR /app
COPY server/package.json server/package-lock.json* ./server/
RUN cd server && npm install --omit=dev

FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=8787

COPY --from=deps /app/server/node_modules ./server/node_modules
COPY server/ ./server/
COPY src/ ./src/
COPY src2/ ./src2/
COPY examples/ ./examples/
COPY index.html project.config.js share.config.js ./

EXPOSE 8787
VOLUME ["/app/server/data"]
CMD ["node", "server/server.js"]
