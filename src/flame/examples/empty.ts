import type { FlameFunction } from '../flameFunction'

export const empty: FlameFunction[] = [
  {
    probability: 1.0,
    preAffine: { a: 1, b: 0.0, c: 0.0, d: 0, e: 1, f: 0.0 },
    postAffine: { a: 1, b: 0, c: 0, d: 0, e: -1, f: 0 },
    color: { x: 0.8, y: 0.2 },
    variations: [{ type: 'heart', weight: 1 }],
  },
]
