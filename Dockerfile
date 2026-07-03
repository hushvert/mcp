# Container image for the hushvert MCP server (stdio transport).
#
# Used by Glama for introspection and by anyone who wants to run the server in a
# container. The server starts and answers MCP introspection (initialize +
# tools/list) with no configuration; HUSHVERT_API_KEY is only needed for the
# conversion tools to actually run against the hosted API.
#
#   docker build -t hushvert-mcp .
#   docker run -i --rm -e HUSHVERT_API_KEY=hv_live_... hushvert-mcp

FROM node:22-slim AS build
WORKDIR /app

# Install dependencies, then build the dist bundles from source.
COPY package.json ./
RUN npm install --no-audit --no-fund
COPY . .
RUN npm run build

# Runtime image: production dependencies only (the SDK + zod are kept external by
# the esbuild bundle) plus the built output.
FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production
COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund
COPY --from=build /app/dist ./dist

# stdio MCP server: JSON-RPC on stdout, diagnostics on stderr.
ENTRYPOINT ["node", "dist/cli.js"]
