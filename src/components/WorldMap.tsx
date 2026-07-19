import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { geoCentroid, geoNaturalEarth1, geoPath } from 'd3-geo'
import { feature } from 'topojson-client'
import countriesTopology from 'world-atlas/countries-110m.json'
import type { Feature, FeatureCollection, Geometry } from 'geojson'
import type { City, Direction, ProgressData } from '../types'
import { memoryKey } from '../lib/scheduler'
import { referenceAnchors } from '../data/anchors'

const WIDTH = 960
const HEIGHT = 500
const QUESTION_FOCUS_SCALE = 2.2

const constrainView = (scale: number, x: number, y: number) => {
  const xMargin = Math.min(WIDTH / 2, WIDTH * (scale - 1) / 2)
  const yMargin = Math.min(HEIGHT / 2, HEIGHT * (scale - 1) / 2)
  return {
    scale,
    x: Math.max(WIDTH * (1 - scale) - xMargin, Math.min(xMargin, x)),
    y: Math.max(HEIGHT * (1 - scale) - yMargin, Math.min(yMargin, y)),
  }
}

interface Point {
  latitude: number
  longitude: number
}

interface WorldMapProps {
  cities: City[]
  progress: ProgressData
  targetCity?: City
  questionDirection?: Direction
  selectedPoint?: Point
  feedback?: boolean
  explore?: boolean
  autoFocusTarget?: boolean
  contrastCityIds?: string[]
  recalledCityIds?: string[]
  onMapClick?: (point: Point) => void
}

type CountryFeature = Feature<Geometry, { name?: string }>

export function WorldMap({
  cities,
  progress,
  targetCity,
  questionDirection,
  selectedPoint,
  feedback = false,
  explore = false,
  autoFocusTarget = false,
  contrastCityIds = [],
  recalledCityIds,
  onMapClick,
}: WorldMapProps) {
  const svgRef = useRef<SVGSVGElement>(null)
  const dragRef = useRef<{ x: number; y: number; tx: number; ty: number } | undefined>(undefined)
  const [view, setView] = useState({ scale: 1, x: 0, y: 0 })
  const countries = useMemo(() => {
    const topology = countriesTopology as { objects: { countries: object } }
    return feature(topology as never, topology.objects.countries as never) as unknown as FeatureCollection<Geometry, { name?: string }>
  }, [])
  const projection = useMemo(() => geoNaturalEarth1().fitSize([WIDTH, HEIGHT], { type: 'Sphere' }), [])
  const path = useMemo(() => geoPath(projection), [projection])
  const spherePath = useMemo(() => path({ type: 'Sphere' }) ?? undefined, [path])
  const countryPath = useMemo(() => path(countries) ?? undefined, [countries, path])
  const countryLabels = useMemo(() => countries.features.flatMap((country) => {
    const center = projection(geoCentroid(country as CountryFeature))
    const name = country.properties?.name
    return center && name ? [{ x: center[0], y: center[1], name }] : []
  }), [countries, projection])
  const referenceIds = useMemo(() => new Set(referenceAnchors.map((city) => city.id)), [])
  const markerCities = useMemo(
    () => progress.settings.showAnchors ? [...referenceAnchors, ...cities] : cities,
    [cities, progress.settings.showAnchors],
  )

  const memoryStatus = (city: City) => {
    const memories = [
      progress.memories[memoryKey(city.id, 'location-to-name')],
      progress.memories[memoryKey(city.id, 'name-to-location')],
    ].filter(Boolean)
    if (memories.length === 2 && memories.every((memory) => memory.status === 'mastered')) return 'mastered'
    if (memories.some((memory) => memory.lastRating === 'again')) return 'failed'
    if (memories.some((memory) => memory.status === 'review')) return 'familiar'
    if (memories.length) return 'learning'
    return 'unknown'
  }

  const visibleCityIds = useMemo(() => {
    if (recalledCityIds) return new Set([...recalledCityIds, ...progress.anchors, ...(progress.settings.showAnchors ? referenceAnchors.map((city) => city.id) : [])])
    if (explore) return new Set([...cities.map((city) => city.id), ...(progress.settings.showAnchors ? referenceAnchors.map((city) => city.id) : [])])
    const result = new Set<string>()
    if (progress.settings.showAnchors) {
      progress.anchors.forEach((id) => result.add(id))
      referenceAnchors.forEach((anchor) => result.add(anchor.id))
    }
    for (const city of cities) {
      const memories = [
        progress.memories[memoryKey(city.id, 'location-to-name')],
        progress.memories[memoryKey(city.id, 'name-to-location')],
      ].filter(Boolean)
      if (memories.length) result.add(city.id)
    }
    contrastCityIds.forEach((id) => result.add(id))
    if (targetCity && (questionDirection === 'location-to-name' || feedback)) result.add(targetCity.id)
    if (targetCity && questionDirection === 'name-to-location' && !feedback) result.delete(targetCity.id)
    return result
  }, [cities, contrastCityIds, explore, feedback, progress, questionDirection, recalledCityIds, targetCity])

  const projectCity = (city: City) => projection([city.longitude, city.latitude])
  const targetPoint = targetCity ? projectCity(targetCity) : null
  const selectedProjected = selectedPoint ? projection([selectedPoint.longitude, selectedPoint.latitude]) : null
  const visibleMarkerCities = markerCities
    .filter((city) => visibleCityIds.has(city.id))
    .sort((left, right) => {
      const layer = (city: City) => city.id === targetCity?.id ? 2 : contrastCityIds.includes(city.id) ? 1 : 0
      return layer(left) - layer(right)
    })

  const eventPoint = (event: React.PointerEvent<SVGSVGElement>): Point | undefined => {
    const rect = svgRef.current?.getBoundingClientRect()
    if (!rect) return undefined
    const rawX = (event.clientX - rect.left) / rect.width * WIDTH
    const rawY = (event.clientY - rect.top) / rect.height * HEIGHT
    const x = (rawX - view.x) / view.scale
    const y = (rawY - view.y) / view.scale
    const inverted = projection.invert?.([x, y])
    return inverted ? { longitude: inverted[0], latitude: inverted[1] } : undefined
  }

  useEffect(() => {
    const shouldFocus = autoFocusTarget || (questionDirection === 'location-to-name' && !feedback)
    if (!targetCity || !shouldFocus) return
    const point = projection([targetCity.longitude, targetCity.latitude])
    if (!point) return
    setView(constrainView(
      QUESTION_FOCUS_SCALE,
      WIDTH / 2 - point[0] * QUESTION_FOCUS_SCALE,
      HEIGHT / 2 - point[1] * QUESTION_FOCUS_SCALE,
    ))
  }, [autoFocusTarget, feedback, projection, questionDirection, targetCity?.id, targetCity?.latitude, targetCity?.longitude])

  const zoomAt = useCallback((factor: number, anchorX = WIDTH / 2, anchorY = HEIGHT / 2) => setView((current) => {
    const scale = Math.max(1, Math.min(4, current.scale * factor))
    const worldX = (anchorX - current.x) / current.scale
    const worldY = (anchorY - current.y) / current.scale
    return constrainView(scale, anchorX - worldX * scale, anchorY - worldY * scale)
  }), [])

  useEffect(() => {
    const map = svgRef.current
    if (!map) return
    const handleWheel = (event: WheelEvent) => {
      event.preventDefault()
      const rect = map.getBoundingClientRect()
      const anchorX = rect.width ? (event.clientX - rect.left) / rect.width * WIDTH : WIDTH / 2
      const anchorY = rect.height ? (event.clientY - rect.top) / rect.height * HEIGHT : HEIGHT / 2
      zoomAt(Math.exp(-event.deltaY * 0.0015), anchorX, anchorY)
    }
    map.addEventListener('wheel', handleWheel, { passive: false })
    return () => map.removeEventListener('wheel', handleWheel)
  }, [zoomAt])

  return (
    <div className="map-shell">
      <svg
        ref={svgRef}
        className={onMapClick ? 'world-map is-clickable' : 'world-map'}
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        role={onMapClick ? 'button' : 'img'}
        aria-label={onMapClick ? 'World map. Click to choose a location.' : 'World progress map'}
        onPointerDown={(event) => {
          if (view.scale <= 1) return
          event.preventDefault()
          dragRef.current = { x: event.clientX, y: event.clientY, tx: view.x, ty: view.y }
          event.currentTarget.setPointerCapture?.(event.pointerId)
        }}
        onPointerMove={(event) => {
          const drag = dragRef.current
          if (!drag || !event.buttons) return
          const rect = svgRef.current?.getBoundingClientRect()
          if (!rect?.width || !rect.height) return
          const x = drag.tx + (event.clientX - drag.x) / rect.width * WIDTH
          const y = drag.ty + (event.clientY - drag.y) / rect.height * HEIGHT
          setView((current) => constrainView(current.scale, x, y))
        }}
        onPointerUp={(event) => {
          const drag = dragRef.current
          dragRef.current = undefined
          if (event.currentTarget.hasPointerCapture?.(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
          if (drag && Math.hypot(event.clientX - drag.x, event.clientY - drag.y) > 5) return
          const point = eventPoint(event)
          if (point && onMapClick) onMapClick(point)
        }}
        onPointerCancel={(event) => {
          dragRef.current = undefined
          if (event.currentTarget.hasPointerCapture?.(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
        }}
        onLostPointerCapture={() => { dragRef.current = undefined }}
      >
        <defs>
          <radialGradient id="oceanGlow"><stop offset="0" stopColor="#173a43" /><stop offset="1" stopColor="#071b24" /></radialGradient>
        </defs>
        <rect width={WIDTH} height={HEIGHT} rx="18" fill="url(#oceanGlow)" />
        <g transform={`translate(${view.x} ${view.y}) scale(${view.scale})`}>
          <path d={spherePath} className="sphere-outline" />
          <path d={countryPath} className={progress.settings.showCountryBoundaries ? 'country' : 'country no-boundary'} vectorEffect="non-scaling-stroke" />
          {progress.settings.showCountryNames && view.scale >= 1.35 && countryLabels.map((country) => (
            <text key={country.name} x={country.x} y={country.y} className="country-label">{country.name}</text>
          ))}
          {visibleMarkerCities.map((city) => {
            const point = projectCity(city)
            if (!point) return null
            const isReference = referenceIds.has(city.id)
            const status = isReference ? 'reference' : recalledCityIds?.includes(city.id) ? 'recalled' : memoryStatus(city)
            const isTarget = city.id === targetCity?.id
            const isContrast = contrastCityIds.includes(city.id)
            const exploreLabelAllowed = explore
              && progress.settings.showExploreCityLabels
              && (view.scale >= 1.8 || city.importance >= 4 || status !== 'unknown' || isReference)
            const studyLabelAllowed = !explore
              && (isReference || progress.anchors.includes(city.id) || (status === 'mastered' && progress.settings.showMasteredLabels))
            const labelAllowed = !isTarget
              && !isContrast
              && (exploreLabelAllowed || studyLabelAllowed)
            return (
              <g
                key={city.id}
                data-city-id={city.id}
                className={`city-marker ${status} ${isTarget ? 'target' : ''} ${isContrast ? 'contrast' : ''}`}
                transform={`translate(${point[0]} ${point[1]})`}
              >
                <g className="marker-glyph" transform={`scale(${1 / view.scale})`}>
                  {progress.settings.showWeakHeat && (status === 'failed' || status === 'learning') && <circle cx="0" cy="0" r="10" className="heat-ring" />}
                  {(isTarget || isContrast || status === 'recalled') && <circle cx="0" cy="0" r={isTarget || isContrast ? 8.5 : 6.2} className="marker-halo" vectorEffect="non-scaling-stroke" />}
                  <circle cx="0" cy="0" r={isTarget || isContrast ? 5.5 : 3.2} className="marker-dot" vectorEffect="non-scaling-stroke" />
                </g>
                {labelAllowed && (
                  <g className="city-label-glyph" transform={`scale(${1 / view.scale})`}>
                    <text x="7" y="-7">{city.displayName.replace(/, .+$/, '')}</text>
                  </g>
                )}
              </g>
            )
          })}
          {feedback && selectedProjected && (
            <g transform={`translate(${selectedProjected[0]} ${selectedProjected[1]}) scale(${1 / view.scale})`}>
              <circle cx="0" cy="0" r="5" className="selected-point" vectorEffect="non-scaling-stroke" />
            </g>
          )}
          {feedback && selectedProjected && targetPoint && <line x1={selectedProjected[0]} y1={selectedProjected[1]} x2={targetPoint[0]} y2={targetPoint[1]} className="error-line" vectorEffect="non-scaling-stroke" />}
        </g>
      </svg>
      <div className="map-controls" aria-label="Map zoom controls">
        <button type="button" onClick={() => zoomAt(1.5)} aria-label="Zoom in">+</button>
        <button type="button" onClick={() => zoomAt(1 / 1.5)} aria-label="Zoom out">−</button>
        <button type="button" onClick={() => setView({ scale: 1, x: 0, y: 0 })} aria-label="Reset map">⌖</button>
      </div>
      {onMapClick && !feedback && <div className="map-hint">Click anywhere on the map</div>}
    </div>
  )
}
