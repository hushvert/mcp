# Security

## Reporting

Report vulnerabilities to security@hushvert.com. Do not open a public issue for a
security report.

## How this server handles your key

`@hushvert/mcp` holds one secret: your `hv_live_` API key, supplied via the
`HUSHVERT_API_KEY` environment variable in your MCP host config.

- The key is read once from the environment. It is never written to disk, never
  committed, and never sent anywhere except as a `Bearer` token to the configured
  API base (`https://hushvert.com` by default).
- All diagnostics are written to stderr only (stdout is the MCP JSON-RPC channel)
  and are scrubbed of any `hv_live_` token, so a key cannot leak into your host's
  logs, a transcript, or an error returned to the agent.
- If `HUSHVERT_API_KEY` is unset, the conversion tools return a clean
  authentication error rather than calling the API.

## Filesystem access

The server reads the file an agent asks it to convert and writes the result. To
contain that:

- It refuses to silently overwrite an existing file: a conversion whose default
  output path already exists fails unless you pass `output_path` explicitly.
- Set `HUSHVERT_ALLOWED_DIR` to confine every read and write to a single
  directory subtree. Any path outside it is refused.

## Spend safety

The hosted API is the real ceiling: per-key rate limits, the free monthly
allowance, your credit balance, and account spend caps are all enforced
server-side and cannot be exceeded by this client. As a client-side guard against
a runaway agent loop, set `HUSHVERT_MAX_JOBS_PER_SESSION` to cap conversions per
server run, and have your agent call `check_usage` before large batches.
