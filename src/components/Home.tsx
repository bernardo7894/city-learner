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
      <section className="hero">
        <div>
          <p className="eyebrow">Your world, remembered</p>
          <h1>Build a map that<br /><em>stays with you.</em></h1>
          <p className="hero-copy">Learn the world’s largest cities by placing them, naming them, and untangling the pairs your memory mixes up.</p>
          <div className="hero-actions">
            <button className="primary-button large" onClick={() => onStart(due ? 'review' : 'learn')}>{due ? `Review ${due} due` : 'Learn new cities'} <span>→</span></button>
            {!hasProgress && <button className="secondary-button large" onClick={() => onStart('placement')}>Take placement test</button>}
          </div>
        </div>
        <div className="globe-orbit" aria-hidden="true">
          <div className="orbit orbit-one" /><div className="orbit orbit-two" />
          <div className="globe-disc"><span>324</span><small>cities to discover</small></div>
          <i className="pin pin-a" /><i className="pin pin-b" /><i className="pin pin-c" />
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
          <div className="section-heading"><div><p className="eyebrow">Choose your route</p><h2>Play modes</h2></div></div>
          <div className="learn-preference">
            <div><strong>Learn session size</strong><small>No daily limit—start another session whenever you like.</small></div>
            <label>New cities <input type="number" min="1" max={QUEUE_CONFIG.maxNewPerSession} value={newCitiesPerSession} onChange={(event) => {
              const value = Math.min(QUEUE_CONFIG.maxNewPerSession, Math.max(1, Number(event.target.value) || 1))
              setProgress((current) => ({ ...current, settings: { ...current.settings, newCitiesPerSession: value } }))
            }} /> per session</label>
          </div>
          <div className="mode-grid">
            <ModeCard accent="gold" icon="✦" title="Learn" body={`Meet up to ${newCitiesPerSession} new cities through map-first teaching.`} onClick={() => onStart('learn')} />
            <ModeCard accent="mint" icon="↻" title="Review" body="Clear due memories and protect knowledge that is fading." onClick={() => onStart('review')} badge={due ? `${due} due` : undefined} />
            <ModeCard accent="coral" icon="⌁" title="Weak cities" body="Focus on lapses, slow names, and wide map misses." onClick={() => onStart('weak')} />
            <ModeCard accent="violet" icon="⇄" title="Confusion drill" body="Separate city pairs your memory keeps crossing." onClick={() => onStart('confusion')} badge={progress.confusions.filter((edge) => edge.strength >= 2).length ? 'Ready' : undefined} />
            <ModeCard accent="blue" icon="◎" title="Free recall" body="Light up a blank world map with everything you can summon." onClick={() => onNavigate('recall')} />
            <ModeCard accent="sand" icon="◫" title="Explore progress" body="Inspect every city, memory direction, and next review." onClick={() => onNavigate('progress')} />
          </div>
        </div>
        <aside className="insight-panel">
          <p className="eyebrow">Memory signals</p>
          <h2>Where to look next</h2>
          <div className="insight-row"><span>Weakest area</span><strong>{weakest}</strong></div>
          <div className="insight-row"><span>Strongest confusion</span><strong>{confusionLabel}</strong></div>
          <div className="insight-row"><span>Anchors visible</span><strong>{referenceAnchors.length + progress.anchors.length}</strong></div>
          <p className="insight-note">Mastered cities leave ordinary sessions and return only when their maintenance review is due.</p>
          <button className="text-button" onClick={() => onNavigate('progress')}>Open the full map →</button>
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
