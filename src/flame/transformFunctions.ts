import { random } from '@/shaders/random'
import tgpu, { TgpuFn } from 'typegpu'
import { AnyWgslData, f32, Infer, struct, Vec2f, vec2f } from 'typegpu/data'
import { PI } from './constants'
import { AffineParams } from './types'

export type SimpleFunction = {
  type: 'simple'
  fn: TgpuFn<[Vec2f], Vec2f>
}

export type DependentFunction = {
  type: 'dependent'
  fn: TgpuFn<[Vec2f, typeof AffineParams], Vec2f>
}

export type ParametricFunction<T extends AnyWgslData> = {
  type: 'parametric'
  paramShema: T
  fn: TgpuFn<[Vec2f, T], Vec2f>
}

const simpleFn = (
  wgsl: string,
  dependencyMap: Record<string, unknown> = {},
): SimpleFunction => ({
  type: 'simple',
  fn: tgpu['~unstable'].fn([vec2f], vec2f).does(wgsl).$uses(dependencyMap),
})

const dependentFn = (
  wgsl: string,
  dependencyMap: Record<string, unknown> = {},
): DependentFunction => ({
  type: 'dependent',
  fn: tgpu['~unstable']
    .fn([vec2f, AffineParams], vec2f)
    .does(wgsl)
    .$uses(dependencyMap),
})

const parametricFn = <T extends AnyWgslData>(
  paramShema: T,
  wgsl: string,
  dependencyMap: Record<string, unknown> = {},
): ParametricFunction<T> => ({
  type: 'parametric',
  paramShema,
  fn: tgpu['~unstable']
    .fn([vec2f, paramShema], vec2f)
    .does(wgsl)
    .$uses(dependencyMap),
})

const linear = simpleFn(/* wgsl */ `
  (pos: vec2f) -> vec2f {
    return pos;
  }`)

export const GridParams = struct({
  divisions: f32,
  size: f32,
  jitterNearIntersectionsDistance: f32,
})
const grid = parametricFn(
  GridParams,
  /* wgsl */ `(_pos: vec2f, P: GridParams) -> vec2f {
    let D = P.jitterNearIntersectionsDistance;
    let divs = select(P.divisions, 1, random() > 0.8);
    let pos = P.size * (2 * vec2f(random(), random()) - 1);
    let jitter = 2 * D * (2 * vec2f(random(), random()) - 1);
    let rounded = round(divs * pos) / divs;
    let diff = abs(pos - rounded);
    let jittered = select(pos, pos + jitter, diff < vec2f(D));
    return select(
      vec2f(rounded.x, jittered.y),
      vec2f(jittered.x, rounded.y),
      random() > 0.5
    );
  }`,
  { random },
)

const randomDisk = simpleFn(
  /* wgsl */ `
  (pos: vec2f) -> vec2f {
    let r = sqrt(random());
    let theta = random() * 2 * PI;
    return r * vec2f(cos(theta), sin(theta));
  }`,
  { random, PI },
)

const gaussian = simpleFn(
  /* wgsl */ `
  (pos: vec2f) -> vec2f {
    let r = random() + random() + random() + random() - 2;
    let theta = random() * 2 * PI;
    return r * vec2f(cos(theta), sin(theta));
  }`,
  { random, PI },
)

const sinusoidal = simpleFn(/* wgsl */ `
  (pos: vec2f) -> vec2f {
    return vec2f(sin(pos.x), sin(pos.y));
  }`)

const spherical = simpleFn(/* wgsl */ `
  (pos: vec2f) -> vec2f {
    let r2 = dot(pos, pos);
    return pos / r2;
  }`)

const swirl = simpleFn(/* wgsl */ `
  (pos: vec2f) -> vec2f {
    let r2 = dot(pos, pos);
    let s2 = sin(r2);
    let c2 = cos(r2);
    return vec2f(
      pos.x * s2 - pos.y * c2,
      pos.x * c2 + pos.y * s2,
    );
  }`)

const popcorn = dependentFn(/* wgsl */ `
  (pos: vec2f, T: AffineParams) -> vec2f {
    return vec2f(
      pos.x + T.c * sin(tan(3 * pos.y)),
      pos.y + T.f * sin(tan(3 * pos.x)),
    );
  }`)

export const PieParams = struct({
  slices: f32,
  rotation: f32,
  thickness: f32,
})
const pie = parametricFn(
  PieParams,
  /* wgsl */ `(pos: vec2f, P: PieParams) -> vec2f {
    let p1 = P.slices;
    let p2 = P.rotation;
    let p3 = P.thickness;
    let r1 = random();
    let r2 = random();
    let r3 = random();
    let t1 = trunc(r1 * p1 + 0.5);
    let t2 = p2 + (t1 + r2 * p3) * 2 * PI / p1;
    return r3 * vec2f(cos(t2), sin(t2));
  }`,
  { random, PI },
)

const horseshoe = simpleFn(
  /* wgsl */ `
  (pos: vec2f) -> vec2f {
    let r = sqrt(dot(pos, pos)); 
    let sqDiff = (pos.x - pos.y) * (pos.x + pos.y);
    return vec2f(sqDiff / r, (2.0 * pos.x * pos.y) / r);
  }`,
)

const polar = simpleFn(
  /* wgsl */ `
  (pos: vec2f) -> vec2f {
    if(abs(pos.y) < 1e-6) {
      return vec2f(0.0, 0.0);
    }

    let r = sqrt(dot(pos, pos)); 
    let theta = atan(pos.x / pos.y);
    return vec2f(theta / PI, r - 1);
  }`,
  { PI },
)

const handkerchief = simpleFn(
  /* wgsl */ `
  (pos: vec2f) -> vec2f {
    if(abs(pos.y) < 1e-6) {
      return vec2f(0.0, 0.0);
    }

    let r = sqrt(dot(pos, pos)); 
    let theta = atan(pos.x / pos.y);
    return vec2f(r * sin(theta + r), r * cos(theta - r));
  }`,
)

const heart = simpleFn(
  /* wgsl */ `
  (pos: vec2f) -> vec2f {
    if(abs(pos.y) < 1e-6) {
      return vec2f(0.0, 0.0);
    }

    let r = sqrt(dot(pos, pos)); 
    let theta = atan(pos.x / pos.y);
    return vec2f(r * sin(theta * r), r * -cos(theta * r));
  }`,
)

const disc = simpleFn(
  /* wgsl */ `
  (pos: vec2f) -> vec2f {
    if(abs(pos.y) < 1e-6) {
      return vec2f(0.0, 0.0);
    }

    let r = sqrt(dot(pos, pos));
    let theta = atan(pos.x / pos.y);
    let thOverPi = theta / PI;
    return vec2f(thOverPi * sin(PI * r), thOverPi * cos(PI * r));
  }`,
  { PI },
)

const spiral = simpleFn(
  /* wgsl */ `
  (pos: vec2f) -> vec2f {
    if(abs(pos.y) < 1e-6) {
      return vec2f(0.0, 0.0);
    }

    let r = sqrt(dot(pos, pos));
    let theta = atan(pos.x / pos.y);
    let oneOverR = 1 / r;
    return vec2f(oneOverR * (cos(theta) + sin(r)), oneOverR * (sin(theta) - cos(r)));
  }`,
  { PI },
)

const hyperbolic = simpleFn(
  /* wgsl */ `
  (pos: vec2f) -> vec2f {
    if(abs(pos.y) < 1e-6) {
      return vec2f(0.0, 0.0);
    }

    let r = sqrt(dot(pos, pos));
    let theta = atan(pos.x / pos.y);
    return vec2f(sin(theta) / r, r * cos(theta));
  }`,
)

export type TransformFunction = keyof typeof transformFunctions
export const transformFunctions = {
  linear,
  sinusoidal,
  spherical,
  swirl,
  popcorn,
  pie,
  randomDisk,
  gaussian,
  grid,
  horseshoe,
  polar,
  handkerchief,
  heart,
  disc,
  spiral,
  hyperbolic,
}

export type TransformFunctionDescriptor = {
  [K in TransformFunction]: (typeof transformFunctions)[K] extends ParametricFunction<
    infer P
  >
  ? { type: K; weight: number; params: Infer<P> }
  : { type: K; weight: number }
}[TransformFunction]
