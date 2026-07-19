import type { City } from '../types'

const anchor = (id: string, displayName: string, countryCode: string, countryName: string, latitude: number, longitude: number): City => ({
  id: `reference-${id}`,
  seedName: id,
  displayName,
  countryCode,
  countryName,
  latitude,
  longitude,
  acceptedAnswers: [displayName],
  alternateNames: [],
  importance: 4,
  dataConfidence: 'verified',
})

// Stable orientation landmarks, deliberately denser in Europe. These are not
// curriculum records and never enter the scheduler.
export const referenceAnchors: City[] = [
  anchor('london', 'London', 'GB', 'United Kingdom', 51.5074, -0.1278),
  anchor('paris', 'Paris', 'FR', 'France', 48.8566, 2.3522),
  anchor('lisbon', 'Lisbon', 'PT', 'Portugal', 38.7223, -9.1393),
  anchor('madrid', 'Madrid', 'ES', 'Spain', 40.4168, -3.7038),
  anchor('berlin', 'Berlin', 'DE', 'Germany', 52.52, 13.405),
  anchor('amsterdam', 'Amsterdam', 'NL', 'Netherlands', 52.3676, 4.9041),
  anchor('vienna', 'Vienna', 'AT', 'Austria', 48.2082, 16.3738),
  anchor('prague', 'Prague', 'CZ', 'Czechia', 50.0755, 14.4378),
  anchor('athens', 'Athens', 'GR', 'Greece', 37.9838, 23.7275),
  anchor('new-york', 'New York', 'US', 'United States', 40.7128, -74.006),
  anchor('los-angeles', 'Los Angeles', 'US', 'United States', 34.0522, -118.2437),
  anchor('mexico-city', 'Mexico City', 'MX', 'Mexico', 19.4326, -99.1332),
  anchor('sao-paulo', 'São Paulo', 'BR', 'Brazil', -23.5505, -46.6333),
  anchor('buenos-aires', 'Buenos Aires', 'AR', 'Argentina', -34.6037, -58.3816),
  anchor('cairo', 'Cairo', 'EG', 'Egypt', 30.0444, 31.2357),
  anchor('lagos', 'Lagos', 'NG', 'Nigeria', 6.5244, 3.3792),
  anchor('johannesburg', 'Johannesburg', 'ZA', 'South Africa', -26.2041, 28.0473),
  anchor('delhi', 'Delhi', 'IN', 'India', 28.6139, 77.209),
  anchor('beijing', 'Beijing', 'CN', 'China', 39.9042, 116.4074),
  anchor('seoul', 'Seoul', 'KR', 'South Korea', 37.5665, 126.978),
  anchor('tokyo', 'Tokyo', 'JP', 'Japan', 35.6762, 139.6503),
  anchor('singapore', 'Singapore', 'SG', 'Singapore', 1.3521, 103.8198),
  anchor('jakarta', 'Jakarta', 'ID', 'Indonesia', -6.2088, 106.8456),
  anchor('sydney', 'Sydney', 'AU', 'Australia', -33.8688, 151.2093),
]
