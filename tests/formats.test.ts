import { describe, expect, it } from 'vitest'
import { buildPairSlug, defaultOutputPath, inferFormatFromPath, normalizeFormatId } from '../src/formats'

describe('format inference', () => {
  it('normalizes extension aliases to matrix ids', () => {
    expect(normalizeFormatId('JPEG')).toBe('jpg')
    expect(normalizeFormatId('.tif')).toBe('tiff')
    expect(normalizeFormatId('htm')).toBe('html')
    expect(normalizeFormatId('yml')).toBe('yaml')
    expect(normalizeFormatId('tex')).toBe('latex')
    expect(normalizeFormatId('PDF')).toBe('pdf')
  })

  it('infers the source format from a file path', () => {
    expect(inferFormatFromPath('/x/y/report.docx')).toBe('docx')
    expect(inferFormatFromPath('CLIP.MOV')).toBe('mov')
    expect(inferFormatFromPath('noext')).toBe('')
  })

  it('builds the canonical pair slug', () => {
    expect(buildPairSlug('docx', 'pdf')).toBe('docx-to-pdf')
    expect(buildPairSlug('JPEG', 'PNG')).toBe('jpg-to-png')
  })

  it('derives a default output path with the target extension', () => {
    expect(defaultOutputPath('/a/b/report.docx', 'pdf', '/a/b')).toBe('/a/b/report.pdf')
    expect(defaultOutputPath('/a/b/clip.MOV', 'mp4', '/a/b')).toBe('/a/b/clip.mp4')
  })
})
