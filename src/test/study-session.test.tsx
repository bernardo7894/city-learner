import { fireEvent, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { City } from '../types'
import { StudySession } from '../components/StudySession'
import { createEmptyProgress } from '../lib/persistence'

const changchun: City = {
  id: 'changchun-cn',
  seedName: 'changchun',
  displayName: 'Changchun',
  countryCode: 'CN',
  countryName: 'China',
  admin1: 'Jilin',
  latitude: 43.88,
  longitude: 125.32,
  geonamesId: 2038180,
  acceptedAnswers: ['Changchun'],
  alternateNames: [],
  importance: 3,
  dataConfidence: 'verified',
}

afterEach(() => vi.unstubAllGlobals())

describe('StudySession keyboard teaching flow', () => {
  it('fits a long single-word city name and advances the teaching step with Enter', () => {
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      callback(0)
      return 0
    })
    const progress = createEmptyProgress([changchun])
    progress.settings.newCitiesPerSession = 1
    const { getByRole, getByText } = render(
      <StudySession mode="learn" cities={[changchun]} progress={progress} setProgress={vi.fn()} onExit={vi.fn()} />,
    )

    expect(getByRole('heading', { name: 'Changchun' })).toHaveClass('name-medium')
    expect(getByRole('button', { name: /I’ve placed it/i })).toHaveFocus()

    fireEvent.keyDown(window, { key: 'Enter' })

    expect(getByText('Locate this city')).toBeInTheDocument()
  })
})
