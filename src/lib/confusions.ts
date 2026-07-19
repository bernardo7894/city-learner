import type { ConfusionEdge } from '../types'

function pairKey(first: string, second: string): string {
  return [first, second].sort().join('|')
}

export function recordConfusion(
  edges: ConfusionEdge[],
  sourceCityId: string,
  confusedWithCityId: string,
  now = new Date(),
): ConfusionEdge[] {
  if (sourceCityId === confusedWithCityId) return edges
  const key = pairKey(sourceCityId, confusedWithCityId)
  const existing = edges.find((edge) => pairKey(edge.sourceCityId, edge.confusedWithCityId) === key)
  if (!existing) {
    return [...edges, {
      sourceCityId,
      confusedWithCityId,
      strength: 1,
      lastOccurredAt: now.toISOString(),
      successfulDiscriminations: 0,
    }]
  }
  return edges.map((edge) => edge === existing ? {
    ...edge,
    strength: Math.min(10, edge.strength + 1),
    lastOccurredAt: now.toISOString(),
  } : edge)
}

export function recordDiscrimination(
  edges: ConfusionEdge[],
  firstCityId: string,
  secondCityId: string,
): ConfusionEdge[] {
  const key = pairKey(firstCityId, secondCityId)
  return edges.map((edge) => pairKey(edge.sourceCityId, edge.confusedWithCityId) === key ? {
    ...edge,
    strength: Math.max(0, edge.strength - 0.35),
    successfulDiscriminations: edge.successfulDiscriminations + 1,
  } : edge)
}

export function strongestConfusions(edges: ConfusionEdge[]): ConfusionEdge[] {
  return [...edges].filter((edge) => edge.strength > 0).sort((a, b) => b.strength - a.strength)
}
