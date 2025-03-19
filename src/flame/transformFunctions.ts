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
    let r = sqrt(dot(pos, pos)); 
    let theta = atan2(pos.y, pos.x);
    return vec2f(theta / PI, r - 1);
  }`,
  { PI },
)

const handkerchief = simpleFn(
  /* wgsl */ `
  (pos: vec2f) -> vec2f {
    let r = sqrt(dot(pos, pos)); 
    let theta = atan2(pos.y, pos.x);
    return vec2f(r * sin(theta + r), r * cos(theta - r));
  }`,
)

const heart = simpleFn(
  /* wgsl */ `
  (pos: vec2f) -> vec2f {
    let r = sqrt(dot(pos, pos)); 
    let theta = atan2(pos.y, pos.x);
    return vec2f(r * sin(theta * r), r * -cos(theta * r));
  }`,
)

const disc = simpleFn(
  /* wgsl */ `
  (pos: vec2f) -> vec2f {
    let r = length(pos);
    let theta = atan2(pos.y, pos.x);
    let thOverPi = theta / PI;
    return vec2f(thOverPi * sin(PI * r), thOverPi * cos(PI * r));
  }`,
  { PI },
)

const spiral = simpleFn(
  /* wgsl */ `
  (pos: vec2f) -> vec2f {
    let r = length(pos);
    let theta = atan2(pos.y, pos.x);
    let oneOverR = 1 / r;
    return vec2f(oneOverR * (cos(theta) + sin(r)), oneOverR * (sin(theta) - cos(r)));
  }`,
  { PI },
)

const hyperbolic = simpleFn(
  /* wgsl */ `
  (pos: vec2f) -> vec2f {
    let r = length(pos);
    let theta = atan2(pos.y, pos.x);
    return vec2f(sin(theta) / r, r * cos(theta));
  }`,
)

const diamond = simpleFn(
  /* wgsl */ `
  (pos: vec2f) -> vec2f {
    let r = length(pos);
    let theta = atan2(pos.y, pos.x);
    return vec2f(sin(theta) * cos(r), cos(theta) * sin(r));
  }`,
)

const exVar = simpleFn(
  /* wgsl */ `
  (pos: vec2f) -> vec2f {
    let r = length(pos);
    let theta = atan2(pos.y, pos.x);
    let p0 = sin(theta + r);
    let p1 = cos(theta - r);
    let p03 = p0 * p0 * p0;
    let p13 = p1 * p1 * p1;
    return vec2f(r * (p03 + p13), r * (p03 - p13));
  }`,
)

const julia = simpleFn(
  /* wgsl */ `
  (pos: vec2f) -> vec2f {
    let sqrtr = sqrt(length(pos));
    let theta = atan2(pos.y, pos.x);
    let rand = random();
    let omega = select(0, PI, random() > 0.5);
    let angle = theta / 2.0 + omega;

    return vec2f(sqrtr * cos(angle), sqrtr * sin(angle));
  }`,
  { random, PI },
)

const bent = simpleFn(
  /* wgsl */ `
  (pos: vec2f) -> vec2f {
    let fx = select(pos.x, 2.0 * pos.x, pos.x < 0);
    let fy = select(pos.y, pos.y / 2.0, pos.y < 0);
    return vec2f(fx, fy);
  }`,
)

const waves = dependentFn(
  /* wgsl */ `
  (pos: vec2f, T: AffineParams) -> vec2f {
    let xSinArg = pos.y / (T.c * T.c); 
    let ySinArg = pos.x / (T.f * T.f); 
    return vec2f(
      pos.x + T.b * sin(xSinArg),
      pos.y + T.e * sin(ySinArg),
    );
  }`,
)

const fisheye = simpleFn(
  /* wgsl */ `
  (pos: vec2f) -> vec2f {
    let r = length(pos);
    let factor = 2.0 / (r + 1); 
    return vec2f(factor * pos.y, factor * pos.x);
  }`,
)

const eyefish = simpleFn(
  /* wgsl */ `
  (pos: vec2f) -> vec2f {
    let r = length(pos);
    let factor = 2.0 / (r + 1); 
    return vec2f(factor * pos.x, factor * pos.y);
  }`,
)

const exponential = simpleFn(
  /* wgsl */ `
  (pos: vec2f) -> vec2f {
    let factor = exp(pos.x - 1.0); 
    return vec2f(factor * cos(PI * pos.y), factor * sin(PI * pos.y));
  }`,
  { PI },
)

const power = simpleFn(
  /* wgsl */ `
  (pos: vec2f) -> vec2f {
    let r = length(pos);
    let theta = atan2(pos.y, pos.x);
    let exponent = sin(theta);
    let factor = pow(r, exponent);
    return vec2f(factor * cos(theta), factor * sin(theta));
  }`,
)

const cosine = simpleFn(
  /* wgsl */ `
  (pos: vec2f) -> vec2f {
    let x = cos(PI * pos.x) * cosh(pos.y);
    let y = -sin(PI * pos.x) * sinh(pos.y);
    return vec2f(x, y);
  }`,
  { PI },
)

const rings = dependentFn(
  /* wgsl */ `
  (pos: vec2f, T: AffineParams) -> vec2f {
    let mc2 = T.c * T.c;
    let r = length(pos); 
    let theta = atan2(pos.y, pos.x);
    let factor = (r + mc2) % (2.0 * mc2) - mc2 + r * (1.0 - mc2);
    return vec2f(factor * cos(theta), factor * sin(theta));
  }`,
)

const fan = dependentFn(
  /* wgsl */ `
  (pos: vec2f, T: AffineParams) -> vec2f {
    let t = PI * T.c * T.c;
    let r = length(pos); 
    let theta = atan2(pos.y, pos.x);

    let thalf = t / 2;
    let trueAngle = theta - thalf;
    let falseAngle = theta + thalf;
    let modCond = (theta + T.f) % t;
    let angle = select(falseAngle, trueAngle, modCond > thalf);
    return vec2f(r * cos(angle), r * sin(angle));
  }`,
  { PI },
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
  diamond,
  exVar,
  julia,
  bent,
  waves,
  fisheye,
  eyefish,
  exponential,
  power,
  cosine,
  rings,
  fan,
}

export type TransformFunctionDescriptor = {
  [K in TransformFunction]: (typeof transformFunctions)[K] extends ParametricFunction<
    infer P
  >
  ? { type: K; weight: number; params: Infer<P> }
  : { type: K; weight: number }
}[TransformFunction]
