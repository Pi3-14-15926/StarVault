import { describe, it, expect } from 'vitest'
import { fmtSize } from '../imageCompressor'

describe('fmtSize', () => {
  it('formats zero', () => {
    expect(fmtSize(0)).toBe('0 B')
  })

  it('formats bytes (< 1024)', () => {
    expect(fmtSize(1)).toBe('1 B')
    expect(fmtSize(500)).toBe('500 B')
    expect(fmtSize(1023)).toBe('1023 B')
  })

  it('formats kilobytes (< 1MB)', () => {
    expect(fmtSize(1024)).toBe('1.0 KB')
    expect(fmtSize(2048)).toBe('2.0 KB')
    expect(fmtSize(1536)).toBe('1.5 KB')
    expect(fmtSize(1024 * 1024 - 1)).toBe('1024.0 KB')
  })

  it('formats megabytes (>= 1MB)', () => {
    expect(fmtSize(1024 * 1024)).toBe('1.00 MB')
    expect(fmtSize(1024 * 1024 * 2.5)).toBe('2.50 MB')
    expect(fmtSize(1024 * 1024 * 100)).toBe('100.00 MB')
  })
})
