import { useEffect, useMemo, useRef, useState } from 'react'
import type { AnswerResult, City, ProgressData, Rating, SessionItem, SessionMode, SessionStats } from '../types'
import { recordConfusion, recordDiscrimination } from '../lib/confusions'
import { gradeClick, haversineDistanceKm, nearestCities, nearestCity } from '../lib/geography'
import { matchTypedAnswer } from '../lib/normalization'
import { getOrCreateMemory, selectSessionQueue } from '../lib/queue'
import { inferTypedRating, memoryKey, reconcileCityMastery, reviewMemory } from '../lib/scheduler'
import { WorldMap } from './WorldMap'
import { referenceAnchors } from '../data/anchors'

interface StudySessionProps {
  mode: SessionMode
  cities: City[]
  progress: ProgressData
  setProgress: (update: ProgressData | ((current: ProgressData) => ProgressData)) => void
  onExit: () => void
}

interface Feedback {
  result: AnswerResult
  selectedPoint?: { latitude: number; longitude: number }
  headline: string
}

const emptyStats = (): SessionStats => ({
  answers: [],
  introducedCityIds: [],
  initialMasteredIds: [],
  confusionCreated: 0,
  confusionWeakened: 0,
})

function relativeDue(date?: string): string {
  if (!date) return '—'
  const minutes = Math.round((new Date(date).getTime() - Date.now()) / 60_000)
  if (minutes < 60) return `in ${Math.max(1, minutes)} min`
  if (minutes < 1440) return `in ${Math.round(minutes / 60)} hr`
  return `in ${Math.round(minutes / 1440)} days`
}

function median(values: number[]): number | undefined {
  if (!values.length) return undefined
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2
}

export function StudySession({ mode, cities, progress, setProgress, onExit }: StudySessionProps) {
  const [items, setItems] = useState(() => selectSessionQueue(mode, cities, progress))
  const [index, setIndex] = useState(0)
  const [feedback, setFeedback] = useState<Feedback>()
  const [answer, setAnswer] = useState('')
  const [hintUsed, setHintUsed] = useState(false)
  const [paused, setPaused] = useState(false)
  const [startedAt, setStartedAt] = useState(Date.now())
  const [stats, setStats] = useState<SessionStats>(emptyStats)
  const inputRef = useRef<HTMLInputElement>(null)
  const cityById = useMemo(() => new Map(cities.map((city) => [city.id, city])), [cities])
  const item = items[index]
  const city = item ? cityById.get(item.cityId) : undefined

  useEffect(() => {
    setStartedAt(Date.now())
    setAnswer('')
    setHintUsed(false)
    setFeedback(undefined)
    requestAnimationFrame(() => inputRef.current?.focus())
  }, [index])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setPaused((value) => !value)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  const appendContrastIfReady = (sourceCityId?: string, otherCityId?: string) => {
    if (!sourceCityId || !otherCityId) return
    const existing = progress.confusions.find((edge) => [edge.sourceCityId, edge.confusedWithCityId].includes(sourceCityId) && [edge.sourceCityId, edge.confusedWithCityId].includes(otherCityId))
    if ((existing?.strength ?? 0) < 1) return
    setItems((current) => {
      const alreadyQueued = current.some((queued) => queued.kind === 'contrast' && [queued.cityId, queued.otherCityId].includes(sourceCityId) && [queued.cityId, queued.otherCityId].includes(otherCityId))
      if (alreadyQueued) return current
      return [...current, { id: `contrast-live-${sourceCityId}-${otherCityId}`, kind: 'contrast', cityId: sourceCityId, otherCityId }]
    })
  }

  const recordAnswer = (
    result: AnswerResult,
    headline: string,
    selectedPoint?: { latitude: number; longitude: number },
  ) => {
    setStats((current) => ({ ...current, answers: [...current.answers, result] }))
    setFeedback({ result, headline, selectedPoint })
  }

  const applyQuestionResult = (
    rating: Rating,
    result: Omit<AnswerResult, 'rating' | 'correct' | 'nextDueAt'>,
    confusedWithCityId?: string,
  ): AnswerResult => {
    if (!item || item.kind !== 'question' || !city) throw new Error('No active question')
    const now = new Date()
    const memory = getOrCreateMemory(progress, city.id, item.direction, now)
    const reviewed = reviewMemory(memory, rating, now, {
      responseMs: result.responseMs,
      clickErrorKm: result.distanceKm,
      placement: item.placement,
    })
    setProgress((current) => {
      let next: ProgressData = {
        ...current,
        memories: { ...current.memories, [memoryKey(city.id, item.direction)]: reviewed },
      }
      if (confusedWithCityId) next = { ...next, confusions: recordConfusion(next.confusions, city.id, confusedWithCityId, now) }
      return reconcileCityMastery(next, city.id)
    })
    if (confusedWithCityId) {
      const existed = progress.confusions.some((edge) => [edge.sourceCityId, edge.confusedWithCityId].includes(city.id) && [edge.sourceCityId, edge.confusedWithCityId].includes(confusedWithCityId))
      setStats((current) => ({ ...current, confusionCreated: current.confusionCreated + (existed ? 0 : 1) }))
      appendContrastIfReady(city.id, confusedWithCityId)
    }
    return { ...result, rating, correct: rating !== 'again', confusedWithCityId, nextDueAt: reviewed.dueAt }
  }

  const submitTyped = (reveal = false) => {
    if (feedback || !city || !item || item.kind !== 'question' || item.direction !== 'location-to-name') return
    const responseMs = Date.now() - startedAt
    const match = reveal ? { correct: false, typo: false, ambiguous: false, confusedWithCityId: undefined } : matchTypedAnswer(answer, city, cities)
    const rating = inferTypedRating(match.correct, responseMs, match.typo, hintUsed)
    const result = applyQuestionResult(rating, { responseMs, typedAnswer: answer, typo: match.typo, hintUsed }, match.confusedWithCityId)
    const headline = match.correct ? (match.typo ? 'Close enough — minor typo' : 'Correct') : reveal ? 'Answer revealed' : 'Not this time'
    recordAnswer(result, headline)
  }

  const submitLocation = (point: { latitude: number; longitude: number }) => {
    if (feedback || !city || !item) return
    if (item.kind === 'contrast') {
      const other = cityById.get(item.otherCityId)
      if (!other) return
      const targetDistance = haversineDistanceKm(point.latitude, point.longitude, city.latitude, city.longitude)
      const otherDistance = haversineDistanceKm(point.latitude, point.longitude, other.latitude, other.longitude)
      const correct = targetDistance <= otherDistance
      const result: AnswerResult = { rating: correct ? 'good' : 'again', correct, responseMs: Date.now() - startedAt, distanceKm: targetDistance }
      setProgress((current) => ({
        ...current,
        confusions: correct
          ? recordDiscrimination(current.confusions, city.id, other.id)
          : recordConfusion(current.confusions, city.id, other.id),
      }))
      setStats((current) => ({
        ...current,
        answers: [...current.answers, result],
        confusionWeakened: current.confusionWeakened + (correct ? 1 : 0),
      }))
      setFeedback({ result, selectedPoint: point, headline: correct ? 'Pair distinguished' : `That marker is ${other.displayName}` })
      return
    }
    if (item.kind !== 'question' || item.direction !== 'name-to-location') return
    const responseMs = Date.now() - startedAt
    const distanceKm = haversineDistanceKm(point.latitude, point.longitude, city.latitude, city.longitude)
    const rating = gradeClick(distanceKm)
    const nearest = nearestCity(point.latitude, point.longitude, cities)
    const confusedWithCityId = rating === 'again' && nearest && nearest.city.id !== city.id && nearest.distanceKm < 200 ? nearest.city.id : undefined
    const result = applyQuestionResult(rating, { responseMs, distanceKm }, confusedWithCityId)
    recordAnswer(result, rating === 'again' ? 'Outside the target region' : rating === 'hard' ? 'Right area' : rating === 'good' ? 'Good placement' : 'Excellent placement', point)
  }

  const next = () => setIndex((current) => current + 1)

  if (!items.length) {
    return (
      <main className="study-page centered-card">
        <div className="empty-orbit">◎</div>
        <p className="eyebrow">Queue clear</p>
        <h1>{mode === 'confusion' ? 'No strong confusions yet' : 'Nothing needs attention right now'}</h1>
        <p className="muted">Try Learn for new cities, or return when the next review is due.</p>
        <button className="primary-button" onClick={onExit}>Back to overview</button>
      </main>
    )
  }

  if (!item || !city) {
    const correct = stats.answers.filter((entry) => entry.correct).length
    const responseMedian = median(stats.answers.map((entry) => entry.responseMs))
    const clickMedian = median(stats.answers.map((entry) => entry.distanceKm).filter((value): value is number => value != null))
    const upcoming = Object.values(progress.memories).sort((a, b) => new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime()).slice(0, 4)
    return (
      <main className="summary-page">
        <p className="eyebrow">Session complete</p>
        <h1>You moved the map forward.</h1>
        <div className="summary-grid">
          <div><strong>{correct}/{stats.answers.length}</strong><span>correct</span></div>
          <div><strong>{stats.answers.filter((entry) => entry.rating === 'again').length}</strong><span>lapses</span></div>
          <div><strong>{responseMedian ? `${(responseMedian / 1000).toFixed(1)}s` : '—'}</strong><span>median response</span></div>
          <div><strong>{clickMedian ? `${Math.round(clickMedian)} km` : '—'}</strong><span>median click error</span></div>
        </div>
        <div className="summary-columns">
          <section className="panel">
            <h2>Learning changes</h2>
            <p><span className="metric-dot coral" /> {stats.confusionCreated} confusion pair{stats.confusionCreated === 1 ? '' : 's'} created</p>
            <p><span className="metric-dot mint" /> {stats.confusionWeakened} pair{stats.confusionWeakened === 1 ? '' : 's'} weakened</p>
            <p><span className="metric-dot gold" /> {items.filter((entry) => entry.kind === 'teach').length} cities introduced</p>
          </section>
          <section className="panel">
            <h2>Coming up</h2>
            {upcoming.map((memory) => <p key={memoryKey(memory.cityId, memory.direction)}>{cityById.get(memory.cityId)?.displayName} <span className="muted">· {relativeDue(memory.dueAt)}</span></p>)}
          </section>
        </div>
        <button className="primary-button" onClick={onExit}>Return home</button>
      </main>
    )
  }

  if (item.kind === 'teach') {
    const personalAnchors = progress.anchors.map((id) => cityById.get(id)).filter((value): value is City => Boolean(value))
    const nearby = nearestCities(city, [...referenceAnchors, ...personalAnchors], 3)
    return (
      <main className="study-page">
        <StudyHeader index={index} total={items.length} mode={mode} onPause={() => setPaused(true)} />
        <div className="teach-layout">
          <section className="teach-copy">
            <p className="eyebrow">Meet a new place</p>
            <h1>{city.displayName}</h1>
            <p className="country-line">{city.countryName}{city.admin1 ? ` · ${city.admin1}` : ''}</p>
            <div className="coordinate-clue">{city.latitude >= 0 ? 'Northern' : 'Southern'} Hemisphere · {city.longitude >= 0 ? 'East of Greenwich' : 'West of Greenwich'}</div>
            <h3>Place it relative to</h3>
            <ul className="anchor-list">
              {nearby.map(({ city: anchor, distanceKm }) => <li key={anchor.id}><span>{anchor.displayName}</span><strong>{Math.round(distanceKm).toLocaleString()} km</strong></li>)}
            </ul>
            <p className="muted small">Importance tier {5 - city.importance} · GeoNames #{city.geonamesId}</p>
            <button className="primary-button" onClick={() => {
              setStats((current) => ({ ...current, introducedCityIds: [...new Set([...current.introducedCityIds, city.id])] }))
              next()
            }}>I’ve placed it →</button>
          </section>
          <WorldMap cities={cities} progress={progress} targetCity={city} questionDirection="location-to-name" feedback autoFocusTarget />
        </div>
        {paused && <PauseOverlay onResume={() => setPaused(false)} onExit={onExit} />}
      </main>
    )
  }

  const otherCity = item.kind === 'contrast' ? cityById.get(item.otherCityId) : undefined
  const typed = item.kind === 'question' && item.direction === 'location-to-name'
  return (
    <main className="study-page">
      <StudyHeader index={index} total={items.length} mode={mode} onPause={() => setPaused(true)} />
      <section className="question-heading">
        <p className="eyebrow">{item.kind === 'contrast' ? 'Contrast drill' : typed ? 'Name this city' : 'Locate this city'}</p>
        <h1>{item.kind === 'contrast' ? <>Which marker is <em>{city.displayName}</em>?</> : typed ? 'What city is marked?' : city.displayName}</h1>
        {item.kind === 'contrast' && otherCity && <p className="muted">Choose between {city.displayName} and {otherCity.displayName}.</p>}
      </section>
      <WorldMap
        cities={cities}
        progress={progress}
        targetCity={city}
        questionDirection={item.kind === 'question' ? item.direction : undefined}
        selectedPoint={feedback?.selectedPoint}
        feedback={Boolean(feedback)}
        contrastCityIds={item.kind === 'contrast' ? [city.id, item.otherCityId] : []}
        onMapClick={!typed && !feedback ? submitLocation : undefined}
      />
      {typed && !feedback && (
        <form className="answer-bar" onSubmit={(event) => { event.preventDefault(); submitTyped() }}>
          <input ref={inputRef} value={answer} onChange={(event) => setAnswer(event.target.value)} placeholder="Type a city name…" autoComplete="off" aria-label="City name" />
          <button className="primary-button" disabled={!answer.trim()}>Check</button>
          <button className="quiet-button" type="button" onClick={() => setHintUsed(true)}>Hint</button>
          <button className="quiet-button" type="button" onClick={() => submitTyped(true)}>Reveal</button>
        </form>
      )}
      {typed && hintUsed && !feedback && <p className="hint-card">It’s in {city.countryName}. The name begins “{city.displayName.slice(0, 2)}…”.</p>}
      {feedback && (
        <section className={`feedback-card ${feedback.result.correct ? 'correct' : 'incorrect'}`} aria-live="polite">
          <div>
            <p className="eyebrow">{feedback.result.rating}</p>
            <h2>{feedback.headline}</h2>
            <p><strong>{city.displayName}</strong> · {city.countryName}{feedback.result.distanceKm != null ? ` · ${Math.round(feedback.result.distanceKm).toLocaleString()} km error` : ''}</p>
            {item.kind === 'question' && typed && <p className="muted small">Accepted: {city.acceptedAnswers.join(' · ')}</p>}
            {item.kind === 'question' && <p className="muted small">Next review {relativeDue(feedback.result.nextDueAt)}</p>}
          </div>
          <button className="primary-button" onClick={next} autoFocus>{index + 1 >= items.length ? 'See summary' : 'Next →'}</button>
        </section>
      )}
      {paused && <PauseOverlay onResume={() => setPaused(false)} onExit={onExit} />}
    </main>
  )
}

function StudyHeader({ index, total, mode, onPause }: { index: number; total: number; mode: string; onPause: () => void }) {
  return (
    <header className="study-header">
      <div><span className="logo-mark">AR</span><span>{mode[0].toUpperCase() + mode.slice(1)}</span></div>
      <div className="session-progress"><span style={{ width: `${index / total * 100}%` }} /></div>
      <button className="icon-button" onClick={onPause} aria-label="Pause session">Ⅱ</button>
    </header>
  )
}

function PauseOverlay({ onResume, onExit }: { onResume: () => void; onExit: () => void }) {
  return (
    <div className="modal-backdrop">
      <section className="modal-card">
        <p className="eyebrow">Session paused</p>
        <h2>Your progress is already saved.</h2>
        <button className="primary-button" onClick={onResume}>Resume</button>
        <button className="quiet-button" onClick={onExit}>Stop session</button>
      </section>
    </div>
  )
}
