import { f32, struct } from 'typegpu/data'
import { parametricVariation } from '../types'
import { random } from '@/shaders/random'

export const RadialBlurParams = struct({
  angle: f32,
})
export const radialBlurVar = parametricVariation(
  RadialBlurParams,
  /* wgsl */ `
  (pos: vec2f, P: RadialBlurParams) -> vec2f {
    let p1 = P.angle; 
    let randSum = random() + random() + random() + random() - 2;
    let v36 = 0.5; 
    let r = length(pos); 
    let t1 = v36 * randSum; 
    let phi = atan2(pos.y, pos.x);
    let t2 = phi + t1 * sin(p1); 
    let t3 = t1 * cos(p1) - 1;
    return 1/v36 * vec2f(
        r * cos(t2) + t3 * pos.x,
        r * sin(t2) + t3 * pos.y
    );
  }`,
  { random },
)
