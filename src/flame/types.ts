import { struct, vec2f } from 'typegpu/data'

export const Point = struct({
  position: vec2f,
})

export const outputTextureFormat = 'rgba32float'
