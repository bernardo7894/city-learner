import { fireEvent, render } from '@testing-library/react'
import { geoNaturalEarth1 } from 'd3-geo'
import { describe, expect, it } from 'vitest'
import type { City } from '../types'
import { WorldMap } from '../components/WorldMap'
import { createEmptyProgress } from '../lib/persistence'
import { createMemory, memoryKey } from '../lib/scheduler'

const chengdu: City = {
  id: 'chengdu-cn',
  seedName: 'chengdu',
  displayName: 'Chengdu',
  countryCode: 'CN',
  countryName: 'China',
  latitude: 30.6667,
  longitude: 104.0667,
  acceptedAnswers: ['Chengdu'],
  alternateNames: [],
  importance: 4,
  dataConfidence: 'verified',
}

const foshan: City = {
  ...chengdu,
  id: 'foshan-cn',
  seedName: 'foshan',
  displayName: 'Foshan',
  latitude: 23.0215,
  longitude: 113.1214,
  acceptedAnswers: ['Foshan'],
}

describe('WorldMap question safety and interaction', () => {
  it('never reveals a name-to-location target before feedback, even when its other memory exists', () => {
    const progress = createEmptyProgress([chengdu])
    progress.memories[memoryKey(chengdu.id, 'location-to-name')] = createMemory(chengdu.id, 'location-to-name')
    progress.anchors = [chengdu.id]

    const { container, rerender } = render(
      <WorldMap cities={[chengdu]} progress={progress} targetCity={chengdu} questionDirection="name-to-location" onMapClick={() => undefined} />,
    )
    expect(container.querySelector(`[data-city-id="${chengdu.id}"]`)).not.toBeInTheDocument()

    rerender(<WorldMap cities={[chengdu]} progress={progress} targetCity={chengdu} questionDirection="name-to-location" feedback />)
    expect(container.querySelector(`[data-city-id="${chengdu.id}"]`)).toBeInTheDocument()
  })

  it('renders the country layer as a single path', () => {
    const progress = createEmptyProgress([chengdu])
    const { container } = render(<WorldMap cities={[chengdu]} progress={progress} />)
    expect(container.querySelectorAll('path.country')).toHaveLength(1)
  })

  it('draws the active target above nearby learned markers with a circular halo', () => {
    const progress = createEmptyProgress([chengdu, foshan])
    progress.memories[memoryKey(foshan.id, 'location-to-name')] = createMemory(foshan.id, 'location-to-name')
    const { container } = render(
      <WorldMap cities={[chengdu, foshan]} progress={progress} targetCity={chengdu} questionDirection="location-to-name" feedback />,
    )

    const markers = [...container.querySelectorAll('[data-city-id]')]
    expect(markers.at(-1)).toHaveAttribute('data-city-id', chengdu.id)
    expect(markers.at(-1)?.querySelector('.marker-halo')).toBeInTheDocument()
    expect(container.querySelector('#markerGlow')).not.toBeInTheDocument()
  })

  it('zooms with the mouse wheel', () => {
    const progress = createEmptyProgress([chengdu])
    const { getByRole } = render(<WorldMap cities={[chengdu]} progress={progress} />)
    const map = getByRole('img')
    const content = map.querySelector('g')
    expect(content).toHaveAttribute('transform', 'translate(0 0) scale(1)')
    const wheel = new WheelEvent('wheel', { deltaY: -300, clientX: 480, clientY: 250, bubbles: true, cancelable: true })
    fireEvent(map, wheel)
    expect(wheel.defaultPrevented).toBe(true)
    expect(content?.getAttribute('transform')).not.toContain('scale(1)')
  })

  it('hides Mental Atlas city names by default and keeps them a fixed screen size when enabled', () => {
    const progress = createEmptyProgress([chengdu])
    const { container, getByRole, rerender } = render(<WorldMap cities={[chengdu]} progress={progress} explore />)
    expect(container.querySelector(`[data-city-id="${chengdu.id}"] .city-label-glyph`)).not.toBeInTheDocument()

    const labeledProgress = {
      ...progress,
      settings: { ...progress.settings, showExploreCityLabels: true },
    }
    rerender(<WorldMap cities={[chengdu]} progress={labeledProgress} explore />)
    const label = container.querySelector(`[data-city-id="${chengdu.id}"] .city-label-glyph`)
    expect(label).toHaveAttribute('transform', 'scale(1)')

    fireEvent.wheel(getByRole('img'), { deltaY: -300, clientX: 480, clientY: 250 })
    expect(label?.getAttribute('transform')).not.toBe('scale(1)')
  })

  it('automatically centers a location-to-name question on its target', () => {
    const progress = createEmptyProgress([chengdu])
    const { getByRole } = render(
      <WorldMap cities={[chengdu]} progress={progress} targetCity={chengdu} questionDirection="location-to-name" />,
    )
    const transform = getByRole('img').querySelector('g')?.getAttribute('transform') ?? ''
    const match = transform.match(/translate\(([-\d.]+) ([-\d.]+)\) scale\(([-\d.]+)\)/)
    const target = geoNaturalEarth1().fitSize([960, 500], { type: 'Sphere' })([chengdu.longitude, chengdu.latitude])

    expect(match).not.toBeNull()
    expect(target).not.toBeNull()
    const [, x, y, scale] = match!.map(Number)
    expect(scale).toBe(2.2)
    expect(x + target![0] * scale).toBeCloseTo(480)
    expect(y + target![1] * scale).toBeCloseTo(250)
  })

  it('automatically centers an explicitly focused teaching target', () => {
    const progress = createEmptyProgress([chengdu])
    const { container, getByRole } = render(
      <WorldMap cities={[chengdu]} progress={progress} targetCity={chengdu} questionDirection="location-to-name" feedback autoFocusTarget />,
    )

    expect(getByRole('img').querySelector('g')).toHaveAttribute(
      'transform',
      expect.stringContaining('scale(2.2)'),
    )
    expect(container.querySelector(`[data-city-id="${chengdu.id}"] .marker-glyph`)).toHaveAttribute(
      'transform',
      expect.stringContaining(`scale(${1 / 2.2})`),
    )
  })

  it('keeps rendering when a captured drag leaves or is cancelled', () => {
    const progress = createEmptyProgress([chengdu])
    const { getByRole } = render(<WorldMap cities={[chengdu]} progress={progress} />)
    const map = getByRole('img') as unknown as SVGSVGElement
    Object.defineProperty(map, 'getBoundingClientRect', { value: () => ({ left: 0, top: 0, width: 960, height: 500, right: 960, bottom: 500, x: 0, y: 0, toJSON: () => undefined }) })
    Object.defineProperty(map, 'setPointerCapture', { value: () => undefined })
    Object.defineProperty(map, 'hasPointerCapture', { value: () => true })
    Object.defineProperty(map, 'releasePointerCapture', { value: () => undefined })

    fireEvent.wheel(map, { deltaY: -300, clientX: 480, clientY: 250 })
    fireEvent.pointerDown(map, { pointerId: 1, buttons: 1, clientX: 480, clientY: 250 })
    fireEvent.pointerMove(map, { pointerId: 1, buttons: 1, clientX: 900, clientY: 490 })
    fireEvent.pointerCancel(map, { pointerId: 1 })

    expect(map).toBeInTheDocument()
    expect(map.querySelector('g')?.getAttribute('transform')).not.toMatch(/NaN|undefined/)
  })
})
