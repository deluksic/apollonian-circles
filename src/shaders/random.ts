import tgpu from 'typegpu'
import { f32, u32 } from 'typegpu/data'

const randomState = tgpu['~unstable'].privateVar(u32, 0)

export const seed = tgpu['~unstable']
  .fn([u32])
  .does(
    /* wgsl */ `(newRandomState: u32) {
      randomState = newRandomState;
    }`,
  )
  .$uses({ randomState })

export const hash = tgpu['~unstable'].fn([u32], u32).does(/* wgsl */ `
  (i: u32) -> u32 {
    var x = i ^ (i >> 17);
    x *= 0xed5ad4bbu;
    x ^= x >> 11;
    x *= 0xac4c1b51u;
    x ^= x >> 15;
    x *= 0x31848babu;
    x ^= x >> 14;
    return x;
  }`)

export const random = tgpu['~unstable']
  .fn([], f32)
  .does(
    /* wgsl */ `() -> f32 {
      randomState = hash(randomState);
      return f32(randomState) / f32(0xffffffffu);
    }`,
  )
  .$uses({ randomState, hash })

export const randomU = tgpu['~unstable']
  .fn([], u32)
  .does(
    /* wgsl */ `() -> u32 {
      randomState = hash(randomState);
      return randomState;
    }`,
  )
  .$uses({ randomState, hash })
