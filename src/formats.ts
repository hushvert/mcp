// Local format inference: just enough to turn an input file path into a `from`
// id and build the pair slug the API expects. This is intentionally tolerant,
// NOT authoritative: the hosted API validates the pair against the formats
// matrix (the data spine) and returns `unknown-pair` / `client-pair` if the
// guess is wrong, so a thin alias table here can never cause a wrong conversion,
// only a clean error. Discovery of the real supported set is list_formats
// (GET /api/v1/formats), never a copy baked in here.

import { basename, extname } from 'node:path'

// Common extension spellings that differ from the matrix format id. Anything not
// listed maps to itself (lowercased). Mirrors the `aliases` in the shared matrix
// for the formats the hosted API actually accepts.
const EXTENSION_ALIASES: Record<string, string> = {
  jpeg: 'jpg',
  tif: 'tiff',
  htm: 'html',
  yml: 'yaml',
  tex: 'latex',
  markdown: 'md',
}

export function normalizeFormatId(raw: string): string {
  const id = raw.trim().toLowerCase().replace(/^\./, '')
  return EXTENSION_ALIASES[id] ?? id
}

export function inferFormatFromPath(path: string): string {
  const ext = extname(path).toLowerCase()
  if (!ext) return ''
  return normalizeFormatId(ext)
}

// The hosted API's canonical pair slug is `${from}-to-${to}` (formats matrix,
// serverPair factory). Build it from normalized ids.
export function buildPairSlug(from: string, to: string): string {
  return `${normalizeFormatId(from)}-to-${normalizeFormatId(to)}`
}

// Default output path: same directory and base name as the input, with the
// target extension. Used when the caller does not pass output_path.
export function defaultOutputPath(inputPath: string, to: string, dir: string): string {
  const base = basename(inputPath)
  const stem = base.includes('.') ? base.slice(0, base.lastIndexOf('.')) : base
  return `${dir}/${stem}.${normalizeFormatId(to)}`
}
