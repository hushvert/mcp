// The four tool handlers. Each is a thin orchestration over the API client; the
// server-side API remains the authority on validation, metering, billing and
// rate limits. These functions are SDK-agnostic (they return a plain ToolResult)
// so they can be unit-tested without a transport.

import { readFile, stat, writeFile } from 'node:fs/promises'
import { isAbsolute, resolve } from 'node:path'
import type { HushvertClient, StatusResult } from './api'
import type { Config } from './config'
import { agentMessage, HushvertApiError } from './errors'
import { buildPairSlug, defaultOutputPath, inferFormatFromPath, normalizeFormatId } from './formats'
import type { Logger } from './redact'
import { redact } from './redact'

export interface ToolResult {
  content: { type: 'text'; text: string }[]
  isError?: boolean
  // The MCP SDK's CallToolResult carries a passthrough index signature; mirror it
  // so a ToolResult is structurally assignable to it at the registration sites.
  [key: string]: unknown
}

export interface ConvertContext {
  client: HushvertClient
  config: Config
  logger: Logger
  // Mutable per-server-session job counter for the client-side circuit breaker.
  session: { jobs: number }
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

function ok(payload: unknown): ToolResult {
  const text = typeof payload === 'string' ? payload : JSON.stringify(payload, null, 2)
  return { content: [{ type: 'text', text }] }
}

function fail(message: string): ToolResult {
  return { content: [{ type: 'text', text: message }], isError: true }
}

// Resolve a caller-supplied path to absolute and enforce the optional sandbox.
// Returns null if it escapes HUSHVERT_ALLOWED_DIR, so the caller can refuse.
function resolveWithin(config: Config, path: string): string | null {
  const abs = isAbsolute(path) ? path : resolve(process.cwd(), path)
  if (config.allowedDir) {
    const root = resolve(config.allowedDir)
    if (abs !== root && !abs.startsWith(root.endsWith('/') ? root : `${root}/`)) return null
  }
  return abs
}

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path)
    return true
  } catch {
    return false
  }
}

// Map any thrown error to a clean, key-free tool result. A client-side pair is
// not a failure: it is a valid answer telling the agent to use the free SDK.
function toErrorResult(err: unknown, config: Config): ToolResult {
  if (err instanceof HushvertApiError) {
    if (err.code === 'client-pair') {
      return ok({
        refused: true,
        reason: err.message,
        suggestion:
          'This pair runs free, client-side, in the browser. Use the @hushvert/engine npm package instead of the hosted API.',
      })
    }
    return fail(agentMessage(err))
  }
  const message = err instanceof Error ? err.message : String(err)
  return fail(redact(`hushvert conversion failed: ${message}`, config.apiKey))
}

export interface ConvertFileArgs {
  input_path: string
  to: string
  from?: string
  output_path?: string
  wait_seconds?: number
  idempotency_key?: string
}

export async function convertFile(ctx: ConvertContext, args: ConvertFileArgs): Promise<ToolResult> {
  const { client, config, session } = ctx

  // Circuit breaker FIRST: refuse before any file read or API call so a runaway
  // loop cannot spend past the session cap (a client-side mirror; the API's own
  // ceilings remain the real gate).
  if (session.jobs >= config.maxJobsPerSession) {
    return fail(
      `Session conversion limit reached (${config.maxJobsPerSession}). This is a client-side guard (HUSHVERT_MAX_JOBS_PER_SESSION); start a new session to continue.`,
    )
  }

  // Resolve + read the input.
  const absInput = resolveWithin(config, args.input_path)
  if (!absInput) {
    return fail('input_path is outside the allowed directory (HUSHVERT_ALLOWED_DIR).')
  }
  if (!(await exists(absInput))) {
    return fail(`input file not found: ${args.input_path}`)
  }
  let bytes: Uint8Array
  try {
    bytes = await readFile(absInput)
  } catch (err) {
    return toErrorResult(err, config)
  }
  if (bytes.byteLength === 0) {
    return fail('input file is empty.')
  }

  // Source format: explicit `from`, else inferred from the extension.
  const from = args.from ? normalizeFormatId(args.from) : inferFormatFromPath(absInput)
  if (!from) {
    return fail('could not infer the source format from the file extension; pass `from` explicitly.')
  }
  const to = normalizeFormatId(args.to)
  const pair = buildPairSlug(from, to)

  // Resolve the output target and guard against a silent overwrite BEFORE we
  // submit (so we never charge a conversion we cannot write).
  const outDir = absInput.slice(0, absInput.lastIndexOf('/')) || '.'
  const wantOutput = args.output_path ?? defaultOutputPath(absInput, to, outDir)
  const absOutput = resolveWithin(config, wantOutput)
  if (!absOutput) {
    return fail('output_path is outside the allowed directory (HUSHVERT_ALLOWED_DIR).')
  }
  if (!args.output_path && (await exists(absOutput))) {
    return fail(
      `a file already exists at the default output path (${absOutput}); pass output_path explicitly to overwrite.`,
    )
  }

  try {
    // Step 1: declare. A client-pair / unknown-pair rejection happens here,
    // server-side, BEFORE any meter bump - so the catch can return a refusal
    // without anything having been charged.
    const submitted = await client.submit({
      pair,
      bytes: bytes.byteLength,
      idempotencyKey: args.idempotency_key,
    })
    // Count the job only once it is accepted (the breaker is a soft mirror).
    session.jobs += 1

    // Step 2: PUT the bytes to R2. An idempotent replay returns the same job and
    // a fresh upload URL; re-uploading the identical bytes is harmless.
    await client.upload(submitted.uploadUrl, bytes)

    // Step 3: poll to completion or the wait deadline.
    const waitSeconds = args.wait_seconds ?? config.defaultWaitSeconds
    const result = await pollUntilSettled(ctx, submitted.jobId, waitSeconds)

    if (result.status === 'error') {
      return fail(`conversion failed: ${result.error ?? 'unknown error'}`)
    }
    if (result.status !== 'done' || !result.downloadUrl) {
      // Still running at the deadline: hand back the job for convert_poll.
      return ok({
        jobId: submitted.jobId,
        status: 'processing',
        resumeWith: 'convert_poll',
        pollAfterSeconds: Math.max(5, Math.round(waitSeconds / 4)),
        note: 'Conversion is still running. Call convert_poll with this jobId and an output_path to finish.',
      })
    }

    // Step 4: download + write.
    const outBytes = await client.download(result.downloadUrl)
    await writeFile(absOutput, outBytes)
    return ok({
      output_path: absOutput,
      jobId: submitted.jobId,
      pair,
      bytesIn: bytes.byteLength,
      bytesOut: outBytes.byteLength,
      status: 'done',
    })
  } catch (err) {
    return toErrorResult(err, config)
  }
}

export interface ConvertPollArgs {
  jobId: string
  output_path?: string
  wait_seconds?: number
}

export async function convertPoll(ctx: ConvertContext, args: ConvertPollArgs): Promise<ToolResult> {
  const { client, config } = ctx
  try {
    const waitSeconds = args.wait_seconds ?? config.defaultWaitSeconds
    const result = await pollUntilSettled(ctx, args.jobId, waitSeconds)

    if (result.status === 'error') {
      return fail(`conversion failed: ${result.error ?? 'unknown error'}`)
    }
    if (result.status !== 'done' || !result.downloadUrl) {
      return ok({
        jobId: args.jobId,
        status: result.status,
        resumeWith: 'convert_poll',
        note: 'Still running. Call convert_poll again later with an output_path.',
      })
    }
    // Done. Write if an output path was given; otherwise hand back the (short-
    // lived) download URL so the agent can fetch or re-call with a path.
    if (!args.output_path) {
      return ok({ jobId: args.jobId, status: 'done', downloadUrl: result.downloadUrl, expiresAt: result.expiresAt })
    }
    const absOutput = resolveWithin(config, args.output_path)
    if (!absOutput) {
      return fail('output_path is outside the allowed directory (HUSHVERT_ALLOWED_DIR).')
    }
    const outBytes = await client.download(result.downloadUrl)
    await writeFile(absOutput, outBytes)
    return ok({ jobId: args.jobId, status: 'done', output_path: absOutput, bytesOut: outBytes.byteLength })
  } catch (err) {
    return toErrorResult(err, config)
  }
}

export async function listFormats(ctx: ConvertContext, args: { from?: string }): Promise<ToolResult> {
  try {
    const { pairs } = await ctx.client.formats()
    const filtered = args.from
      ? pairs.filter((p) => p.from === normalizeFormatId(args.from as string))
      : pairs
    return ok({ pairs: filtered })
  } catch (err) {
    return toErrorResult(err, ctx.config)
  }
}

export async function checkUsage(ctx: ConvertContext): Promise<ToolResult> {
  try {
    const usage = await ctx.client.usage()
    return ok({
      freeTier: usage.freeTier,
      creditsBalance: usage.creditsBalance,
      currentWindow: usage.currentWindow,
    })
  } catch (err) {
    return toErrorResult(err, ctx.config)
  }
}

// Poll status every pollIntervalMs until the job is done/error or the wait
// budget elapses, returning whatever the last status was (the caller decides
// what a still-running status means).
async function pollUntilSettled(ctx: ConvertContext, jobId: string, waitSeconds: number): Promise<StatusResult> {
  const deadline = Date.now() + waitSeconds * 1000
  // Always poll at least once.
  let result = await ctx.client.status(jobId)
  while (result.status !== 'done' && result.status !== 'error' && Date.now() < deadline) {
    await sleep(ctx.config.pollIntervalMs)
    result = await ctx.client.status(jobId)
  }
  return result
}
