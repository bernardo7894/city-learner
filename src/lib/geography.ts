import { GRADING_CONFIG } from '../config'
import type { City, Rating } from '../types'

const EARTH_RADIUS_KM = 6371.0088
const radians = (degrees: number) => degrees * Math.PI / 180

export function haversineDistanceKm(
  latitude1: number,
  longitude1: number,
  latitude2: number,
  longitude2: number,
): number {
  const deltaLatitude = radians(latitude2 - latitude1)
  const deltaLongitude = radians(longitude2 - longitude1)
  const lat1 = radians(latitude1)
  const lat2 = radians(latitude2)
  const a = Math.sin(deltaLatitude / 2) ** 2
    + Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLongitude / 2) ** 2
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(a))
}

export function gradeClick(distanceKm: number): Rating {
  if (distanceKm <= GRADING_CONFIG.clickEasyKm) return 'easy'
  if (distanceKm <= GRADING_CONFIG.clickGoodKm) return 'good'
  if (distanceKm <= GRADING_CONFIG.clickHardKm) return 'hard'
  return 'again'
}

export function nearestCity(latitude: number, longitude: number, cities: City[]): { city: City; distanceKm: number } | undefined {
  let nearest: { city: City; distanceKm: number } | undefined
  for (const city of cities) {
    const distanceKm = haversineDistanceKm(latitude, longitude, city.latitude, city.longitude)
    if (!nearest || distanceKm < nearest.distanceKm) nearest = { city, distanceKm }
  }
  return nearest
}

export function nearestCities(city: City, cities: City[], count = 3): Array<{ city: City; distanceKm: number }> {
  return cities
    .filter((candidate) => candidate.id !== city.id)
    .map((candidate) => ({ city: candidate, distanceKm: haversineDistanceKm(city.latitude, city.longitude, candidate.latitude, candidate.longitude) }))
    .sort((a, b) => a.distanceKm - b.distanceKm)
    .slice(0, count)
}
