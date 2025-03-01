import tgpu from 'typegpu'
import { f32, Infer, struct, vec2f } from 'typegpu/data'

export const Point = struct({
  position: vec2f,
  /** OkLab a and b. */
  color: vec2f,
})

export const outputTextureFormat = 'rgba32float'

export type AffineParams = Infer<typeof AffineParams>
// prettier-ignore
export const AffineParams = struct({
  a: f32, b: f32, c: f32,
  d: f32, e: f32, f: f32,
})

export const transformAffine = tgpu['~unstable'].fn(
  [AffineParams, vec2f],
  vec2f,
).does(/* wgsl */ `
  (T: AffineParams, p: vec2f) -> vec2f {
    return vec2f(
      T.a * p.x + T.b * p.y + T.c,
      T.d * p.x + T.e * p.y + T.f
    );
  }`)
