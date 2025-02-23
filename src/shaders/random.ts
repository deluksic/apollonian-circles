import tgpu from 'typegpu'
import { f32, u32, vec2u } from 'typegpu/data'

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
  }
`)

export const random = tgpu['~unstable'].fn([u32], f32).does(/* wgsl */ `
  (i: u32) -> f32 {
    var x = i ^ (i >> 17);
    x *= 0xed5ad4bbu;
    x ^= x >> 11;
    x *= 0xac4c1b51u;
    x ^= x >> 15;
    x *= 0x31848babu;
    x ^= x >> 14;
    return f32(x) / f32(0xffffffffu);
  }
`)

export const random2 = tgpu['~unstable'].fn([vec2u], f32).does(/* wgsl */ `
  (i: vec2u) -> f32 {
    var x = i.x ^ (i.x >> 17);
    x *= 0xed5ad4bbu;
    x ^= x >> 11;
    x *= 0xac4c1b51u;
    x ^= x >> 15;
    x *= 0x31848babu;
    x ^= x >> 14;
    var y = i.y ^ (x >> 17);
    y *= 0xed5ad4bbu;
    y ^= y >> 11;
    y *= 0xac4c1b51u;
    y ^= y >> 15;
    y *= 0x31848babu;
    y ^= y >> 14;
    return f32(y) / f32(0xffffffffu);
  }
`)
