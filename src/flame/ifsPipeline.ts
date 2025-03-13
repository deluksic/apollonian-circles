import { hash, random, randomState, setSeed } from '@/shaders/random'
import { wgsl } from '@/utils/wgsl'
import tgpu, { StorageFlag, TgpuBuffer, TgpuRoot, UniformFlag } from 'typegpu'
import {
  arrayOf,
  struct,
  vec2f,
  Vec4u,
  vec4u,
  WgslArray,
  WgslStruct,
} from 'typegpu/data'
import { AffineParams, Point, transformAffine } from './types'
import { createFlameWgsl, FlameFunction } from './flameFunction'
import { range } from '@/utils/range'

const flameFunctions: Pick<FlameFunction, 'variations'>[] = [
  {
    variations: [{ type: 'linear', weight: 1 }],
  },
  {
    variations: [
      { type: 'linear', weight: 0.4 },
      { type: 'swirl', weight: 0.5 },
      { type: 'popcorn', weight: 0.1 },
    ],
  },
  {
    variations: [
      { type: 'pie', weight: 0.95 },
      { type: 'gaussian', weight: 0.05 },
    ],
  },
]

const flameUniforms = {
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

const { ceil } = Math
const IFS_GROUP_SIZE = 16

export const ComputeUniforms = struct({
  seed: vec4u,
})

export function createIFSPipeline(
  root: TgpuRoot,
  insideShaderCount: number,
  points: TgpuBuffer<WgslArray<typeof Point>> & StorageFlag,
  computeUniforms: TgpuBuffer<WgslStruct<{ seed: Vec4u }>> & UniformFlag,
) {
  const { device } = root

  const flames = flameFunctions.map(createFlameWgsl)
  const flamesObj = Object.fromEntries(
    flames.map((f, i) => [`flame${i}`, f.fnImpl]),
  )

  const FlameUniforms = struct(
    Object.fromEntries(flames.map((f, i) => [`i${i}`, f.Uniforms])),
  )

  const bindGroupLayout = tgpu.bindGroupLayout({
    points: {
      storage: (length: number) => arrayOf(Point, length),
      access: 'mutable',
    },
    computeUniforms: {
      uniform: ComputeUniforms,
    },
    flameUniforms: {
      uniform: FlameUniforms,
    },
  })

  const flameUniformsBuffer = root.createBuffer(FlameUniforms).$usage('uniform')

  flameUniformsBuffer.write(flameUniforms)

  const bindGroup = root.createBindGroup(bindGroupLayout, {
    points,
    computeUniforms,
    flameUniforms: flameUniformsBuffer,
  })

  const ifsShaderCode = wgsl/* wgsl */ `
    ${{
      ...bindGroupLayout.bound,
      ...flamesObj,
      Point,
      hash,
      setSeed,
      random,
      randomState,
      AffineParams,
      transformAffine,
    }}

    const ITER_COUNT = ${insideShaderCount};

    @compute @workgroup_size(${IFS_GROUP_SIZE}, 1, 1) fn cs(
      @builtin(num_workgroups) numWorkgroups: vec3<u32>,
      @builtin(workgroup_id) workgroupId : vec3<u32>,
      @builtin(local_invocation_index) localInvocationIndex: u32
    ) {
      let workgroupIndex =
        workgroupId.x +
        workgroupId.y * numWorkgroups.x +
        workgroupId.z * numWorkgroups.x * numWorkgroups.y;

      let pointIndex = workgroupIndex * ${IFS_GROUP_SIZE} + localInvocationIndex;

      var point = points[pointIndex];

      var seed = (computeUniforms.seed ^ point.seed) + hash(1234 * pointIndex + point.seed.x);
      setSeed(seed);

      for (var i = 0; i < ITER_COUNT; i += 1) {
        let flameIndex = random();
        var probabilitySum = 0.;
        ${range(flameFunctions.length)
          .map(
            (i) => /* wgsl */ `
            probabilitySum += flameUniforms.i${i}.probability;
            if (flameIndex < probabilitySum) {
              point = flame${i}(point, flameUniforms.i${i});
              continue;
            }
          `,
          )
          .join('\n')}
      }

      point.seed = randomState;
      points[pointIndex] = point;
    }
  `

  const ifsModule = device.createShaderModule({
    code: ifsShaderCode,
  })

  const ifsPipeline = device.createComputePipeline({
    layout: device.createPipelineLayout({
      bindGroupLayouts: [root.unwrap(bindGroupLayout)],
    }),
    compute: {
      module: ifsModule,
    },
  })

  return (pass: GPUComputePassEncoder, pointCount: number) => {
    pass.setPipeline(ifsPipeline)
    pass.setBindGroup(0, root.unwrap(bindGroup))
    pass.dispatchWorkgroups(
      ceil(pointCount / (IFS_GROUP_SIZE * IFS_GROUP_SIZE)),
      IFS_GROUP_SIZE,
      1,
    )
  }
}
