import { v3f } from 'typegpu/data'
import { AffineParams, TransformFunction } from './transformFunctions'

export type FlameFunction = {
  preAffine: AffineParams
  variations: { type: TransformFunction; weight: number }[]
  postAffine: AffineParams
  color: v3f
}
