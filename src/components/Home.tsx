import type { City, ProgressData, SessionMode } from '../types'
import { QUEUE_CONFIG } from '../config'
import { strongestConfusions } from '../lib/confusions'
import { countDue } from '../lib/queue'
import { memoryKey } from '../lib/scheduler'
import { referenceAnchors } from '../data/anchors'

interface HomeProps {
  cities: City[]
  progress: ProgressData
  setProgress: (update: ProgressData | ((current: ProgressData) => ProgressData)) => void
  onStart: (mode: SessionMode) => void
  onNavigate: (page: 'progress' | 'recall' | 'about') => void
}

export function Home({ cities, progress, setProgress, onStart, onNavigate }: HomeProps) {
  const cityById = new Map(cities.map((city) => [city.id, city]))
  const due = countDue(progress)
  const mastered = cities.filter((city) => ['location-to-name', 'name-to-location'].every((direction) => progress.memories[memoryKey(city.id, direction as 'location-to-name' | 'name-to-location')]?.status === 'mastered')).length
  const learning = new Set(Object.values(progress.memories).filter((memory) => memory.status === 'learning' || memory.status === 'review').map((memory) => memory.cityId)).size
  const newCount = cities.filter((city) => !progress.memories[memoryKey(city.id, 'location-to-name')] && !progress.memories[memoryKey(city.id, 'name-to-location')] && !progress.anchors.includes(city.id) && !progress.suspendedCityIds.includes(city.id)).length
  const requestedNewCities = Number(progress.settings.newCitiesPerSession) || QUEUE_CONFIG.defaultNewPerSession
  const newCitiesPerSession = Math.min(QUEUE_CONFIG.maxNewPerSession, Math.max(1, requestedNewCities))
  const strongest = strongestConfusions(progress.confusions)[0]
  const confusionLabel = strongest ? `${cityById.get(strongest.sourceCityId)?.displayName} ↔ ${cityById.get(strongest.confusedWithCityId)?.displayName}` : 'None yet'
  const hasProgress = Object.values(progress.memories).some((memory) => memory.attempts > 0)

  const countryWeakness = new Map<string, { total: number; count: number }>()
  for (const memory of Object.values(progress.memories)) {
    const city = cityById.get(memory.cityId)
    if (!city) continue
    const item = countryWeakness.get(city.countryName) ?? { total: 0, count: 0 }
    item.total += memory.stabilityDays
    item.count += 1
    countryWeakness.set(city.countryName, item)
  }
  const weakest = [...countryWeakness].sort((a, b) => a[1].total / a[1].count - b[1].total / b[1].count)[0]?.[0] ?? 'Not enough data'

  return (
    <main className="home-page">
      <section className="hero personal-home-hero">
        <div>
          <p className="eyebrow">Personal study page</p>
          <h1>Atlas Recall</h1>
          <p className="hero-copy">A private map-based tool for learning and reviewing the names and locations of major cities.</p>
          <div className="hero-actions">
            <button className="primary-button large" onClick={() => onStart(due ? 'review' : 'learn')}>{due ? `Start review (${due} due)` : 'Start learning'} <span>→</span></button>
            {!hasProgress && <button className="secondary-button large" onClick={() => onStart('placement')}>Run placement test</button>}
          </div>
        </div>
      </section>

      <section className="dashboard-strip">
        <div><span className="stat-icon due">↻</span><strong>{due}</strong><small>Reviews due</small></div>
        <div><span className="stat-icon new">✦</span><strong>{newCount}</strong><small>New available</small></div>
        <div><span className="stat-icon learning">◒</span><strong>{learning}</strong><small>In learning</small></div>
        <div><span className="stat-icon mastered">◆</span><strong>{mastered}</strong><small>Mastered</small></div>
      </section>

      <section className="home-content">
        <div>
          <div className="section-heading"><div><p className="eyebrow">Study options</p><h2>What to practise</h2></div></div>
          <div className="learn-preference">
            <div><strong>Learn session size</strong><small>Start another session whenever you want; there is no daily cap.</small></div>
            <label>New cities <input type="number" min="1" max={QUEUE_CONFIG.maxNewPerSession} value={newCitiesPerSession} onChange={(event) => {
              const value = Math.min(QUEUE_CONFIG.maxNewPerSession, Math.max(1, Number(event.target.value) || 1))
              setProgress((current) => ({ ...current, settings: { ...current.settings, newCitiesPerSession: value } }))
            }} /> per session</label>
          </div>
          <div className="mode-grid">
            <ModeCard accent="gold" icon="✦" title="Learn" body={`Introduce up to ${newCitiesPerSession} new cities.`} onClick={() => onStart('learn')} />
            <ModeCard accent="mint" icon="↻" title="Review" body="Review every card that is currently due." onClick={() => onStart('review')} badge={due ? `${due} due` : undefined} />
            <ModeCard accent="coral" icon="⌁" title="Weak cities" body="Practise cities with lapses, slow answers, or large map errors." onClick={() => onStart('weak')} />
            <ModeCard accent="violet" icon="⇄" title="Confusion drill" body="Practise city pairs that you have mixed up." onClick={() => onStart('confusion')} badge={progress.confusions.filter((edge) => edge.strength >= 2).length ? 'Ready' : undefined} />
            <ModeCard accent="blue" icon="◎" title="Free recall" body="Try to name every city you remember on a blank map." onClick={() => onNavigate('recall')} />
            <ModeCard accent="sand" icon="◫" title="Explore progress" body="View per-city progress and scheduled reviews." onClick={() => onNavigate('progress')} />
          </div>
        </div>
        <aside className="insight-panel">
          <p className="eyebrow">Current study notes</p>
          <h2>Review priorities</h2>
          <div className="insight-row"><span>Weakest area</span><strong>{weakest}</strong></div>
          <div className="insight-row"><span>Strongest confusion</span><strong>{confusionLabel}</strong></div>
          <div className="insight-row"><span>Anchors visible</span><strong>{referenceAnchors.length + progress.anchors.length}</strong></div>
          <p className="insight-note">Mastered cities are omitted from ordinary sessions until their next maintenance review is due.</p>
          <button className="text-button" onClick={() => onNavigate('progress')}>View all city progress →</button>
        </aside>
      </section>
    </main>
  )
}

function ModeCard({ accent, icon, title, body, onClick, badge }: { accent: string; icon: string; title: string; body: string; onClick: () => void; badge?: string }) {
  return (
    <button className={`mode-card ${accent}`} onClick={onClick}>
      <span className="mode-icon">{icon}</span>
      <span><strong>{title}</strong><small>{body}</small></span>
      {badge && <b>{badge}</b>}
      <i>→</i>
    </button>
  )
}
