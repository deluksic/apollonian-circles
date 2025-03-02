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
