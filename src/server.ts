// Wire the four tool handlers onto an McpServer. The descriptions matter: they
// are what an agent reads to decide WHEN to reach for hushvert, so they name the
// server-only formats explicitly and steer client-doable conversions back to the
// free SDK.

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { HushvertClient } from './api'
import { type Config, loadConfig } from './config'
import { makeLogger } from './redact'
import { checkUsage, convertFile, convertPoll, type ConvertContext, listFormats } from './tools'

export function createServer(config: Config = loadConfig()): McpServer {
  const logger = makeLogger(config.apiKey)
  const ctx: ConvertContext = {
    client: new HushvertClient(config),
    config,
    logger,
    session: { jobs: 0 },
  }

  const server = new McpServer({ name: 'hushvert', version: '0.1.0' })

  server.registerTool(
    'convert_file',
    {
      title: 'Convert a file with hushvert',
      description:
        'Convert a local file to another format using the hushvert hosted API. Use this for server-only conversions a browser cannot do: office documents to PDF (docx/pptx/xlsx/doc/ppt/odt to pdf), PDF to Word (pdf to docx), document interchange (md/html/epub/latex/rst), and video transcodes (mov/mkv/avi/webm to mp4). Reads the input file, runs the conversion, and writes the result locally. Returns the output path. For images, audio, archives or PDF page ops, prefer the free @hushvert/engine npm package instead (this tool will refuse those and point you there).',
      inputSchema: {
        input_path: z.string().describe('Path to the source file (absolute, or relative to the working directory).'),
        to: z.string().describe('Target format id, e.g. "pdf", "docx", "mp4".'),
        from: z
          .string()
          .optional()
          .describe('Source format id. Inferred from the file extension when omitted.'),
        output_path: z
          .string()
          .optional()
          .describe('Where to write the result. Defaults to the input path with the target extension. Required to overwrite an existing file.'),
        wait_seconds: z
          .number()
          .int()
          .positive()
          .optional()
          .describe('Max seconds to wait for the conversion before returning a jobId to poll. Default 120.'),
        idempotency_key: z
          .string()
          .optional()
          .describe('Optional key to make a retried conversion safe (returns the same job, charges once).'),
      },
    },
    async (args) => convertFile(ctx, args),
  )

  server.registerTool(
    'convert_poll',
    {
      title: 'Finish a long hushvert conversion',
      description:
        'Resume a conversion that was still running when convert_file returned (typically a large video). Poll the job by id and, when done, write the result to output_path.',
      inputSchema: {
        jobId: z.string().describe('The job id returned by convert_file.'),
        output_path: z
          .string()
          .optional()
          .describe('Where to write the result once done. If omitted, returns a short-lived download URL instead.'),
        wait_seconds: z.number().int().positive().optional().describe('Max seconds to wait this call. Default 120.'),
      },
    },
    async (args) => convertPoll(ctx, args),
  )

  server.registerTool(
    'list_formats',
    {
      title: 'List hushvert server conversions',
      description:
        'List the conversions the hushvert hosted API supports (the server-only pairs). Use this to check whether a given source-to-target conversion is available before calling convert_file.',
      inputSchema: {
        from: z.string().optional().describe('Optional: filter to conversions from this source format id.'),
      },
    },
    async (args) => listFormats(ctx, args),
  )

  server.registerTool(
    'check_usage',
    {
      title: 'Check hushvert usage and balance',
      description:
        'Report this account hushvert usage: free monthly conversions remaining, credit balance, and the current billing window. Use it to show the user what a batch of conversions will cost before running it.',
      inputSchema: {},
    },
    async () => checkUsage(ctx),
  )

  return server
}
