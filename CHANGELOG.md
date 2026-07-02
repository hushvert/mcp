# Changelog

## 0.1.0

Initial release. A stdio Model Context Protocol server over the hushvert hosted
API.

- `convert_file`: convert a local file to a server-only format (office to PDF,
  PDF to Word, document interchange, video) in one tool call - read, convert,
  write.
- `convert_poll`: finish a long-running conversion (large video) by job id.
- `list_formats`: enumerate the supported server pairs from the live formats
  endpoint.
- `check_usage`: report free allowance remaining, credit balance, and the current
  billing window.
- Client pairs are refused with a pointer to the free `@hushvert/engine` package.
- Key hygiene: the API key is never logged or surfaced; diagnostics are
  stderr-only and redacted. Optional `HUSHVERT_ALLOWED_DIR` sandbox and
  `HUSHVERT_MAX_JOBS_PER_SESSION` circuit breaker.
