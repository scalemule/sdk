import { describe, it, expect } from 'vitest'
import { PhotoService, PHOTO_BREAKPOINTS } from './services/photo'
import type { ScaleMuleClient } from './client'

describe('PhotoService sizing helpers', () => {
  const photo = new PhotoService({
    getBaseUrl: () => 'https://api.scalemule.com',
  } as unknown as ScaleMuleClient)

  it('exports pre-generated breakpoints', () => {
    expect(PHOTO_BREAKPOINTS).toEqual([150, 320, 640, 1080])
  })

  it('snaps up to nearest breakpoint for retina displays', () => {
    const url = new URL(photo.getOptimalUrl('abc', 280, { dpr: 2 }))

    expect(url.searchParams.get('width')).toBe('640')
    expect(url.searchParams.get('height')).toBe('640')
    expect(url.searchParams.get('fit')).toBe('cover')
    expect(url.searchParams.get('quality')).toBeNull()
    expect(url.searchParams.get('format')).toBeNull()
  })

  it('uses smallest breakpoint for small displays', () => {
    const url = new URL(photo.getOptimalUrl('abc', 48))

    expect(url.searchParams.get('width')).toBe('150')
    expect(url.searchParams.get('height')).toBe('150')
    expect(url.searchParams.get('fit')).toBe('cover')
  })

  it('caps at largest breakpoint for oversized displays', () => {
    const url = new URL(photo.getOptimalUrl('abc', 2000))

    expect(url.searchParams.get('width')).toBe('1080')
    expect(url.searchParams.get('height')).toBe('1080')
    expect(url.searchParams.get('fit')).toBe('cover')
  })

  it('builds srcset from all pre-generated breakpoints', () => {
    const srcSet = photo.getSrcSet('abc')
    const candidates = srcSet.split(', ')

    expect(candidates).toHaveLength(PHOTO_BREAKPOINTS.length)
    expect(candidates.some((c) => c.endsWith('150w'))).toBe(true)
    expect(candidates.some((c) => c.endsWith('320w'))).toBe(true)
    expect(candidates.some((c) => c.endsWith('640w'))).toBe(true)
    expect(candidates.some((c) => c.endsWith('1080w'))).toBe(true)

    for (const candidate of candidates) {
      const [candidateUrl] = candidate.split(' ')
      const url = new URL(candidateUrl)
      expect(url.searchParams.get('fit')).toBe('cover')
      expect(url.searchParams.get('quality')).toBeNull()
      expect(url.searchParams.get('format')).toBeNull()
    }
  })
})
