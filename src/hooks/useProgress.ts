import { useCallback, useEffect, useState } from 'react'
import type { City, ProgressData } from '../types'
import { loadProgress, saveProgress } from '../lib/persistence'

export function useProgress(cities: City[]) {
  const [progress, setProgressState] = useState<ProgressData>(() => loadProgress(cities))

  const setProgress = useCallback((update: ProgressData | ((current: ProgressData) => ProgressData)) => {
    setProgressState((current) => {
      const next = typeof update === 'function' ? update(current) : update
      saveProgress(next)
      return next
    })
  }, [])

  useEffect(() => saveProgress(progress), [progress])
  return [progress, setProgress] as const
}
