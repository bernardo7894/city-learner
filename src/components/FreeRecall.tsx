import { useEffect, useMemo, useState } from 'react'
import type { City, ProgressData } from '../types'
import { matchingCities } from '../lib/normalization'
import { createMemory, memoryKey, reviewMemory } from '../lib/scheduler'
import { WorldMap } from './WorldMap'

interface FreeRecallProps {
  cities: City[]
  progress: ProgressData
  setProgress: (update: ProgressData | ((current: ProgressData) => ProgressData)) => void
  onExit: () => void
}

export function FreeRecall({ cities, progress, setProgress, onExit }: FreeRecallProps) {
  const [running, setRunning] = useState(false)
  const [finished, setFinished] = useState(false)
  const [seconds, setSeconds] = useState(300)
  const [answer, setAnswer] = useState('')
  const [message, setMessage] = useState('')
  const [recalled, setRecalled] = useState<string[]>([])
  const [handled, setHandled] = useState<string[]>([])
  const [filter, setFilter] = useState('')

  useEffect(() => {
    if (!running || finished) return
    const timer = window.setInterval(() => setSeconds((value) => {
      if (value <= 1) {
        setFinished(true)
        setRunning(false)
        return 0
      }
      return value - 1
    }), 1000)
    return () => window.clearInterval(timer)
  }, [finished, running])

  const submit = () => {
    const matches = matchingCities(answer, cities)
    if (matches.length > 1) {
      setMessage('That name is ambiguous here — add the country or region.')
      return
    }
    if (!matches.length) {
      setMessage('Not in this curriculum, or try another accepted spelling.')
      return
    }
    const city = matches[0]
    if (recalled.includes(city.id)) {
      setMessage(`${city.displayName} is already on your map.`)
    } else {
      setRecalled((current) => [...current, city.id])
      setMessage(`${city.displayName} · ${city.countryName}`)
    }
    setAnswer('')
  }

  const classify = (city: City, action: 'forgot' | 'blank' | 'none') => {
    const now = new Date()
    setProgress((current) => {
      const memories = { ...current.memories }
      for (const direction of ['location-to-name', 'name-to-location'] as const) {
        const key = memoryKey(city.id, direction)
        const memory = memories[key] ?? createMemory(city.id, direction, now)
        if (action === 'forgot') memories[key] = reviewMemory(memory, 'again', now)
        if (action === 'blank') memories[key] = {
          ...memory,
          status: 'learning',
          stabilityDays: Math.max(0.5, memory.stabilityDays * 0.8),
          dueAt: new Date(now.getTime() + 86_400_000).toISOString(),
        }
      }
      return { ...current, memories }
    })
    setHandled((current) => [...current, city.id])
  }

  const omitted = useMemo(() => cities
    .filter((city) => !recalled.includes(city.id) && !handled.includes(city.id))
    .filter((city) => `${city.displayName} ${city.countryName}`.toLowerCase().includes(filter.toLowerCase()))
    .sort((a, b) => b.importance - a.importance || a.displayName.localeCompare(b.displayName)), [cities, filter, handled, recalled])

  const blankProgress = useMemo(() => ({ ...progress, anchors: [], settings: { ...progress.settings, showMasteredLabels: false, showAnchors: false } }), [progress])

  return (
    <main className="recall-page">
      <header className="page-header">
        <button className="back-button" onClick={onExit}>← Overview</button>
        <div>
          <p className="eyebrow">Free recall exam</p>
          <h1>What cities can you summon?</h1>
        </div>
        <div className="timer">{Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, '0')}</div>
      </header>
      {!running && !finished && (
        <section className="exam-intro panel">
          <h2>A blank map. Five minutes. No penalty for silence.</h2>
          <p>Type any curriculum city that comes to mind. Correct names light up. At the end, you decide what each omission means for scheduling.</p>
          <button className="primary-button" onClick={() => setRunning(true)}>Start the clock</button>
        </section>
      )}
      {(running || finished) && (
        <>
          <WorldMap cities={cities} progress={blankProgress} recalledCityIds={recalled} />
          {!finished && (
            <form className="answer-bar recall-answer" onSubmit={(event) => { event.preventDefault(); submit() }}>
              <input value={answer} onChange={(event) => setAnswer(event.target.value)} placeholder="Name any city…" autoFocus autoComplete="off" />
              <button className="primary-button" disabled={!answer.trim()}>Add to map</button>
              <button className="quiet-button" type="button" onClick={() => { setFinished(true); setRunning(false) }}>Finish</button>
            </form>
          )}
          <div className="recall-status"><strong>{recalled.length}</strong> recalled <span>{message}</span></div>
        </>
      )}
      {finished && (
        <section className="omissions panel">
          <div className="section-heading">
            <div><p className="eyebrow">Reflection, not punishment</p><h2>Classify omissions</h2></div>
            <input className="compact-input" value={filter} onChange={(event) => setFilter(event.target.value)} placeholder="Filter omitted cities" />
          </div>
          <p className="muted">Only “genuinely forgot” creates a lapse. “Knew it” schedules a gentle check tomorrow.</p>
          <div className="omission-list">
            {omitted.slice(0, 60).map((city) => (
              <article key={city.id}>
                <div><strong>{city.displayName}</strong><span>{city.countryName}</span></div>
                <div>
                  <button onClick={() => classify(city, 'forgot')}>Genuinely forgot</button>
                  <button onClick={() => classify(city, 'blank')}>Knew it, didn’t think of it</button>
                  <button onClick={() => classify(city, 'none')}>No change</button>
                </div>
              </article>
            ))}
          </div>
          <button className="primary-button" onClick={onExit}>Save and return</button>
        </section>
      )}
    </main>
  )
}
