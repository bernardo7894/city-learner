import { lazy, Suspense, useState } from 'react'
import cityData from './data/cities.json'
import type { City, SessionMode } from './types'
import { useProgress } from './hooks/useProgress'
import { Home } from './components/Home'

const About = lazy(() => import('./components/About').then((module) => ({ default: module.About })))
const FreeRecall = lazy(() => import('./components/FreeRecall').then((module) => ({ default: module.FreeRecall })))
const ProgressExplorer = lazy(() => import('./components/ProgressExplorer').then((module) => ({ default: module.ProgressExplorer })))
const StudySession = lazy(() => import('./components/StudySession').then((module) => ({ default: module.StudySession })))

const cities = cityData as City[]
type Page = 'home' | 'progress' | 'recall' | 'about' | 'study'

export default function App() {
  const [progress, setProgress] = useProgress(cities)
  const [page, setPage] = useState<Page>('home')
  const [mode, setMode] = useState<SessionMode>('review')

  const start = (nextMode: SessionMode) => {
    setMode(nextMode)
    setPage('study')
  }

  if (page === 'study') return <Suspense fallback={<Loading />}><StudySession mode={mode} cities={cities} progress={progress} setProgress={setProgress} onExit={() => setPage('home')} /></Suspense>
  if (page === 'progress') return <Suspense fallback={<Loading />}><ProgressExplorer cities={cities} progress={progress} setProgress={setProgress} onExit={() => setPage('home')} /></Suspense>
  if (page === 'recall') return <Suspense fallback={<Loading />}><FreeRecall cities={cities} progress={progress} setProgress={setProgress} onExit={() => setPage('home')} /></Suspense>
  if (page === 'about') return <Suspense fallback={<Loading />}><About onExit={() => setPage('home')} /></Suspense>

  return (
    <>
      <nav className="top-nav">
        <button className="brand" onClick={() => setPage('home')}><span>AR</span><strong>Atlas Recall</strong></button>
        <div>
          <button onClick={() => start('learn')}>Learn</button>
          <button onClick={() => start('review')}>Review</button>
          <button onClick={() => setPage('progress')}>Progress</button>
          <button onClick={() => setPage('about')}>Data</button>
        </div>
      </nav>
      <Home cities={cities} progress={progress} setProgress={setProgress} onStart={start} onNavigate={setPage} />
      <footer><span>Atlas Recall</span><button onClick={() => setPage('about')}>Data attribution & learning model</button><small>Progress stays on this device.</small></footer>
    </>
  )
}

function Loading() {
  return <main className="study-page centered-card"><div className="empty-orbit">◎</div><p className="eyebrow">Opening the atlas</p></main>
}
