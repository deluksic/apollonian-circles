import { align, f32, struct, v2f, vec2f } from 'typegpu/data'
import { TransformFunction, transformFunctions } from './transformFunctions'
import { AffineParams, Point, transformAffine } from './types'
import tgpu from 'typegpu'

export type FlameFunction = {
  preAffine: AffineParams
  variations: { type: TransformFunction; weight: number }[]
  postAffine: AffineParams
  color: v2f
}

const FlameUniformsBase = struct({
  probability: align(16, f32),
  preAffine: align(16, AffineParams),
  postAffine: align(16, AffineParams),
  color: align(16, vec2f),
})

const VariantUniforms = struct({
  weight: align(16, f32),
})

function variationUniforms(name: TransformFunction) {
  const tf = transformFunctions[name]
  if (tf.type === 'parametric') {
    return struct({
      ...VariantUniforms.propTypes,
      params: align(16, tf.paramShema),
    })
  }
  return VariantUniforms
}

function variationInvocation(name: TransformFunction, i: number) {
  switch (transformFunctions[name].type) {
    case 'simple':
      return `${name}(pre)`
    case 'dependent':
      return `${name}(pre, uniforms.preAffine)`
    case 'parametric':
      return `${name}(pre, uniforms.j${i}.params)`
  }
}

export function createFlameWgsl({
  variations,
}: Pick<FlameFunction, 'variations'>) {
  const Uniforms = struct({
    ...FlameUniformsBase.propTypes,
    ...Object.fromEntries(
      variations.map((v, i) => [`j${i}`, variationUniforms(v.type)]),
    ),
  })
  const fnImpl = tgpu['~unstable']
    .fn([Point, Uniforms], Point)
    .does(
      /* wgsl */ `
      (point: Point, uniforms: Uniforms) -> Point {
        let pre = transformAffine(uniforms.preAffine, point.position);
        var p = vec2f(0);
        ${variations
          .map(
            ({ type }, i) =>
              /* wgsl */ `p += uniforms.j${i}.weight * ${variationInvocation(type, i)};`,
          )
          .join('\n')}
        p = transformAffine(uniforms.postAffine, p);
        let color = mix(point.color, uniforms.color, 0.4);
        return Point(p, color);
      }
    `,
    )
    .$uses({
      transformAffine,
      ...Object.fromEntries(
        variations.map((v) => [v.type, transformFunctions[v.type].fn]),
      ),
    })
  return {
    Uniforms,
    fnImpl,
  }
}

export function collectFlameFunctionProps(flameFunctions: FlameFunction[]) {
  return {
    i0: {
      probability: 0.5,
      preAffine: { a: 0.8, b: 0, c: 0.5, d: 0, e: 0.6, f: 0 },
      postAffine: { a: 1, b: 0, c: 0, d: 0, e: 1, f: 0 },
      color: vec2f(0.1, 0.25),
      j0: {
        weight: 1,
      },
    },
    i1: {
      probability: 0.3,
      preAffine: { a: 0.7, b: 0.3, c: 0.1, d: 0, e: 0.6, f: 0.5 },
      postAffine: { a: 1, b: 0, c: 0, d: 0, e: 1, f: 0 },
      color: vec2f(-0.3, 0.1),
      j0: {
        weight: 0.4,
      },
      j1: {
        weight: 0.5,
      },
      j2: {
        weight: 0.1,
      },
    },
    i2: {
      probability: 0.2,
      preAffine: { a: 0.6, b: 0.5, c: -0.5, d: 0, e: 0.5, f: -0.5 },
      postAffine: { a: 0, b: -1, c: 0, d: 1, e: 0, f: 0 },
      color: vec2f(0, -0.3),
      j0: {
        weight: 0.95,
        params: { rotation: 0, slices: 5, thickness: 0.5 },
      },
      j1: {
        weight: 0.05,
      },
    },
  }
}
