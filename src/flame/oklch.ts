import tgpu from 'typegpu'
import { f32, struct, vec3f } from 'typegpu/data'
import { PI } from './constants'

export const OkLchColor = struct({
  l: f32,
  c: f32,
  h: f32,
})

export const oklchToRgb = tgpu['~unstable']
  .fn([OkLchColor], vec3f)
  .does(
    /* wgsl */ `
    (l: f32, c: f32, h: f32) -> vec3f {
      let h_rad = h * PI / 180.0;
      let a = c * cos(h_rad);
      let b = c * sin(h_rad);
      let x = l + 0.3963377774 * a + 0.2158037573 * b;
      let y = l - 0.1055613458 * a - 0.0638541728 * b;
      let z = l - 0.0894841775 * a - 0.0107486103 * b;
      let r =  4.0767416621 * x - 3.3077115913 * y + 0.2309699292 * z;
      let g = -1.2684380046 * x + 2.6097574011 * y - 0.3413193965 * z;
      let b = -0.0041960863 * x - 0.7034186147 * y + 1.7076147010 * z;
      return vec3f(r, g, b);
    }`,
  )
  .$uses({ OkLchColor, PI })
