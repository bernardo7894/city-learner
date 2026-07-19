import { useMemo, useRef, useState } from 'react'
import type { City, Direction, MemoryState, ProgressData } from '../types'
import { createEmptyProgress, exportProgress, importProgress } from '../lib/persistence'
import { createMemory, memoryKey } from '../lib/scheduler'
import { strongestConfusions } from '../lib/confusions'
import { WorldMap } from './WorldMap'

interface ExplorerProps {
  cities: City[]
  progress: ProgressData
  setProgress: (update: ProgressData | ((current: ProgressData) => ProgressData)) => void
  onExit: () => void
}

type Filter = 'all' | 'new' | 'learning' | 'review' | 'mastered' | 'suspended'

function statusForCity(city: City, progress: ProgressData): Filter {
  if (progress.suspendedCityIds.includes(city.id)) return 'suspended'
  const memories = [progress.memories[memoryKey(city.id, 'location-to-name')], progress.memories[memoryKey(city.id, 'name-to-location')]].filter(Boolean)
  if (!memories.length) return 'new'
  if (memories.length === 2 && memories.every((memory) => memory.status === 'mastered')) return 'mastered'
  if (memories.some((memory) => memory.status === 'review')) return 'review'
  return 'learning'
}

function formatDate(date?: string) {
  return date ? new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(date)) : 'Not scheduled'
}

export function ProgressExplorer({ cities, progress, setProgress, onExit }: ExplorerProps) {
  const [filter, setFilter] = useState<Filter>('all')
  const [search, setSearch] = useState('')
  const [selectedId, setSelectedId] = useState(cities[0]?.id)
  const [notice, setNotice] = useState('')
  const importRef = useRef<HTMLInputElement>(null)
  const cityById = useMemo(() => new Map(cities.map((city) => [city.id, city])), [cities])
  const filtered = useMemo(() => cities.filter((city) => {
    const matchesText = `${city.displayName} ${city.countryName} ${city.admin1 ?? ''}`.toLowerCase().includes(search.toLowerCase())
    return matchesText && (filter === 'all' || statusForCity(city, progress) === filter)
  }), [cities, filter, progress, search])
  const selected = cityById.get(selectedId) ?? filtered[0]
  const confusions = strongestConfusions(progress.confusions)

  const updateCity = (city: City, action: 'anchor' | 'suspend' | 'known' | 'reset') => {
    setProgress((current) => {
      if (action === 'anchor') {
        const anchors = current.anchors.includes(city.id) ? current.anchors.filter((id) => id !== city.id) : [...current.anchors, city.id]
        return { ...current, anchors }
      }
      if (action === 'suspend') {
        const suspendedCityIds = current.suspendedCityIds.includes(city.id) ? current.suspendedCityIds.filter((id) => id !== city.id) : [...current.suspendedCityIds, city.id]
        return { ...current, suspendedCityIds }
      }
      if (action === 'reset') {
        const memories = { ...current.memories }
        delete memories[memoryKey(city.id, 'location-to-name')]
        delete memories[memoryKey(city.id, 'name-to-location')]
        return { ...current, memories, confusions: current.confusions.filter((edge) => edge.sourceCityId !== city.id && edge.confusedWithCityId !== city.id) }
      }
      const now = new Date()
      const memories = { ...current.memories }
      for (const direction of ['location-to-name', 'name-to-location'] as const) {
        const base = createMemory(city.id, direction, now)
        memories[memoryKey(city.id, direction)] = {
          ...base,
          status: 'mastered',
          stabilityDays: 45,
          attempts: 3,
          correctAttempts: 3,
          consecutiveCorrect: 3,
          recentRatings: ['easy', 'easy', 'easy'],
          lastRating: 'easy',
          lastReviewedAt: now.toISOString(),
          dueAt: new Date(now.getTime() + 30 * 86_400_000).toISOString(),
        }
      }
      return { ...current, memories }
    })
  }

  const resetDirection = (city: City, direction: Direction) => setProgress((current) => {
    const memories = { ...current.memories }
    delete memories[memoryKey(city.id, direction)]
    return { ...current, memories }
  })

  const download = () => {
    const blob = new Blob([exportProgress(progress)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `atlas-recall-${new Date().toISOString().slice(0, 10)}.json`
    link.click()
    URL.revokeObjectURL(url)
  }

  const upload = async (file?: File) => {
    if (!file) return
    try {
      setProgress(importProgress(await file.text(), cities))
      setNotice('Progress restored successfully.')
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not import this file.')
    }
  }

  return (
    <main className="progress-page">
      <header className="page-header">
        <button className="back-button" onClick={onExit}>← Overview</button>
        <div><p className="eyebrow">Explore progress</p><h1>Your mental atlas</h1></div>
        <div className="data-actions">
          <button className="quiet-button" onClick={download}>Export</button>
          <button className="quiet-button" onClick={() => importRef.current?.click()}>Import</button>
          <input ref={importRef} hidden type="file" accept="application/json" onChange={(event) => upload(event.target.files?.[0])} />
        </div>
      </header>
      {notice && <div className="notice">{notice}</div>}
      <section className="map-settings">
        <label><input type="checkbox" checked={progress.settings.showMasteredLabels} onChange={(event) => setProgress((current) => ({ ...current, settings: { ...current.settings, showMasteredLabels: event.target.checked } }))} /> Mastered labels</label>
        <label><input type="checkbox" checked={progress.settings.showCountryNames} onChange={(event) => setProgress((current) => ({ ...current, settings: { ...current.settings, showCountryNames: event.target.checked } }))} /> Country names</label>
        <label><input type="checkbox" checked={progress.settings.showCountryBoundaries} onChange={(event) => setProgress((current) => ({ ...current, settings: { ...current.settings, showCountryBoundaries: event.target.checked } }))} /> Boundaries</label>
        <label><input type="checkbox" checked={progress.settings.showAnchors} onChange={(event) => setProgress((current) => ({ ...current, settings: { ...current.settings, showAnchors: event.target.checked } }))} /> Anchors</label>
        <label><input type="checkbox" checked={progress.settings.showWeakHeat} onChange={(event) => setProgress((current) => ({ ...current, settings: { ...current.settings, showWeakHeat: event.target.checked } }))} /> Weak-city heat</label>
        <label className="session-setting">Session <input type="range" min="5" max="30" step="5" value={progress.settings.sessionLength} onChange={(event) => setProgress((current) => ({ ...current, settings: { ...current.settings, sessionLength: Number(event.target.value) } }))} /> {progress.settings.sessionLength}</label>
      </section>
      <WorldMap cities={filtered} progress={progress} explore />
      <section className="explorer-layout">
        <div className="city-browser panel">
          <div className="browser-tools">
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search city or country" />
            <select value={filter} onChange={(event) => setFilter(event.target.value as Filter)}>
              <option value="all">All states</option><option value="new">Unknown</option><option value="learning">Learning</option><option value="review">Familiar</option><option value="mastered">Mastered</option><option value="suspended">Suspended</option>
            </select>
          </div>
          <div className="city-list">
            {filtered.map((city) => (
              <button key={city.id} className={city.id === selected?.id ? 'selected' : ''} onClick={() => setSelectedId(city.id)}>
                <span className={`status-dot ${statusForCity(city, progress)}`} /><span><strong>{city.displayName}</strong><small>{city.countryName}</small></span><em>{statusForCity(city, progress)}</em>
              </button>
            ))}
          </div>
        </div>
        {selected && <CityDetail city={selected} progress={progress} onAction={(action) => updateCity(selected, action)} onResetDirection={(direction) => resetDirection(selected, direction)} />}
      </section>
      <section className="confusion-section panel">
        <div className="section-heading"><div><p className="eyebrow">Contrast network</p><h2>Strongest confusion pairs</h2></div></div>
        {confusions.length ? <div className="confusion-list">{confusions.slice(0, 12).map((edge) => <div key={`${edge.sourceCityId}-${edge.confusedWithCityId}`}><strong>{cityById.get(edge.sourceCityId)?.displayName} ↔ {cityById.get(edge.confusedWithCityId)?.displayName}</strong><span style={{ width: `${Math.min(100, edge.strength * 10)}%` }} /><small>{edge.strength.toFixed(1)} strength · {edge.successfulDiscriminations} successful contrasts</small></div>)}</div> : <p className="muted">Confusion pairs appear here when one curriculum city is entered or clicked in place of another.</p>}
      </section>
      <section className="danger-zone panel">
        <div><h3>Reset all local progress</h3><p className="muted">This cannot be undone unless you export first.</p></div>
        <button onClick={() => { if (window.confirm('Reset every memory, confusion, and setting?')) setProgress(createEmptyProgress(cities)) }}>Reset everything</button>
      </section>
    </main>
  )
}

function CityDetail({ city, progress, onAction, onResetDirection }: { city: City; progress: ProgressData; onAction: (action: 'anchor' | 'suspend' | 'known' | 'reset') => void; onResetDirection: (direction: Direction) => void }) {
  const memories = (['location-to-name', 'name-to-location'] as const).map((direction) => ({ direction, memory: progress.memories[memoryKey(city.id, direction)] }))
  return (
    <aside className="city-detail panel">
      <p className="eyebrow">{statusForCity(city, progress)}</p>
      <h2>{city.displayName}</h2>
      <p>{city.countryName}{city.admin1 ? ` · ${city.admin1}` : ''}</p>
      <p className="muted small">{city.latitude.toFixed(4)}, {city.longitude.toFixed(4)} · importance tier {5 - city.importance}</p>
      <div className="memory-grid">
        {memories.map(({ direction, memory }) => <MemoryCard key={direction} direction={direction} memory={memory} onReset={() => onResetDirection(direction)} />)}
      </div>
      <h3>Accepted names</h3><p className="alias-cloud">{city.acceptedAnswers.join(' · ')}</p>
      <h3>Source identity</h3>
      <p className="source-line">GeoNames #{city.geonamesId} · {city.dataConfidence}<br />Seed token: <code>{city.seedName}</code></p>
      <div className="detail-actions">
        <button onClick={() => onAction('anchor')}>{progress.anchors.includes(city.id) ? 'Remove anchor' : 'Pin as anchor'}</button>
        <button onClick={() => onAction('known')}>Mark already known</button>
        <button onClick={() => onAction('suspend')}>{progress.suspendedCityIds.includes(city.id) ? 'Unsuspend' : 'Suspend'}</button>
        <button onClick={() => onAction('reset')}>Reset city</button>
      </div>
    </aside>
  )
}

function MemoryCard({ direction, memory, onReset }: { direction: Direction; memory?: MemoryState; onReset: () => void }) {
  return <div><strong>{direction === 'location-to-name' ? 'Name from map' : 'Place from name'}</strong>{memory ? <><span>{memory.status} · {memory.stabilityDays.toFixed(1)} day stability</span><span>{memory.correctAttempts}/{memory.attempts} correct · {memory.lapses} lapses</span><span>Due {formatDate(memory.dueAt)}</span><button onClick={onReset}>Reset direction</button></> : <span>Not started</span>}</div>
}
