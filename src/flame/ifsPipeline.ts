import { hash, random, seed } from '@/shaders/random'
import { wgsl } from '@/utils/wgsl'
import tgpu, { StorageFlag, TgpuBuffer, TgpuRoot, UniformFlag } from 'typegpu'
import { arrayOf, struct, U32, u32, WgslArray, WgslStruct } from 'typegpu/data'
import { AffineParams, Point, transformAffine } from './types'
import {
  collectFlameFunctionProps,
  createFlameWgsl,
  FlameFunction,
} from './flameFunction'
import { range } from '@/utils/range'

const { ceil } = Math
const IFS_GROUP_SIZE = 16

export const ComputeUniforms = struct({
  seed: u32,
})

const outerIterationBindGroupLayout = tgpu.bindGroupLayout({
  outerIterationIndex: {
    uniform: u32,
  },
})

export function createIFSPipeline(
  root: TgpuRoot,
  maxOuterIterCount: number,
  insideShaderCount: number,
  points: TgpuBuffer<WgslArray<typeof Point>> & StorageFlag,
  computeUniforms: TgpuBuffer<WgslStruct<{ seed: U32 }>> & UniformFlag,
) {
  const { device } = root

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

  flameUniformsBuffer.write(collectFlameFunctionProps([]))

  const bindGroup = root.createBindGroup(bindGroupLayout, {
    points,
    computeUniforms,
    flameUniforms: flameUniformsBuffer,
  })

  const perOuterIterationBindGroups = Array.from({
    length: maxOuterIterCount,
  }).map((_, i) =>
    root.createBindGroup(outerIterationBindGroupLayout, {
      outerIterationIndex: root.createBuffer(u32, i).$usage('uniform'),
    }),
  )

  const ifsShaderCode = wgsl/* wgsl */ `
    ${{
      ...bindGroupLayout.bound,
      ...outerIterationBindGroupLayout.bound,
      ...flamesObj,
      Point,
      hash,
      seed,
      random,
      AffineParams,
      transformAffine,
    }}

    const ITER_COUNT = ${insideShaderCount};

    @compute @workgroup_size(${IFS_GROUP_SIZE}, 1, 1) fn computeSomething(
      @builtin(num_workgroups) num_workgroups: vec3<u32>,
      @builtin(workgroup_id) workgroup_id : vec3<u32>,
      @builtin(local_invocation_index) local_invocation_index: u32
    ) {
      let workgroup_index =
        workgroup_id.x +
        workgroup_id.y * num_workgroups.x +
        workgroup_id.z * num_workgroups.x * num_workgroups.y;

      let i = workgroup_index * ${IFS_GROUP_SIZE} + local_invocation_index;

      seed(computeUniforms.seed ^ hash(workgroup_index) ^ hash(outerIterationIndex));

      var point = points[i];
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

      points[i] = point;
    }
  `

  const ifsModule = device.createShaderModule({
    code: ifsShaderCode,
  })

  const ifsPipeline = device.createComputePipeline({
    layout: device.createPipelineLayout({
      bindGroupLayouts: [
        root.unwrap(bindGroupLayout),
        root.unwrap(outerIterationBindGroupLayout),
      ],
    }),
    compute: {
      module: ifsModule,
    },
  })

  return (
    iteration: number,
    pass: GPUComputePassEncoder,
    pointCount: number,
  ) => {
    const iterationBindGroup = perOuterIterationBindGroups[iteration]
    if (!iterationBindGroup) {
      throw new Error(
        `Requested more iterations (${iteration}) than initially specified ${maxOuterIterCount}.`,
      )
    }
    pass.setPipeline(ifsPipeline)
    pass.setBindGroup(0, root.unwrap(bindGroup))
    pass.setBindGroup(1, root.unwrap(iterationBindGroup))
    pass.dispatchWorkgroups(
      ceil(pointCount / (IFS_GROUP_SIZE * IFS_GROUP_SIZE)),
      IFS_GROUP_SIZE,
      1,
    )
  }
}
