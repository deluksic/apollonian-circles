import { hash, random, seed } from '@/shaders/random'
import { wgsl } from '@/utils/wgsl'
import tgpu, {
  LayoutEntryToInput,
  StorageFlag,
  TgpuBuffer,
  TgpuRoot,
} from 'typegpu'
import { arrayOf, WgslArray } from 'typegpu/data'
import { Point } from './types'
import { ComputeUniforms } from './ifsPipeline'
import { PI } from './constants'

const INIT_GROUP_SIZE = 32

const bindGroupLayout = tgpu.bindGroupLayout({
  points: {
    storage: (length: number) => arrayOf(Point, length),
    access: 'mutable',
  },
  computeUniforms: {
    uniform: ComputeUniforms,
  },
})

export function createInitPointsPipeline(
  root: TgpuRoot,
  points: TgpuBuffer<WgslArray<typeof Point>> & StorageFlag,
  computeUniforms: LayoutEntryToInput<
    (typeof bindGroupLayout)['entries']['computeUniforms']
  >,
) {
  const { device } = root

  const bindGroup = root.createBindGroup(bindGroupLayout, {
    points,
    computeUniforms,
  })

  const initPointsShaderCode = wgsl/* wgsl */ `
    ${{
      ...bindGroupLayout.bound,
      seed,
      random,
      hash,
      PI,
    }}

    @compute @workgroup_size(${INIT_GROUP_SIZE}, 1, 1) fn computeSomething(
      @builtin(num_workgroups) num_workgroups: vec3<u32>,
      @builtin(workgroup_id) workgroup_id : vec3<u32>,
      @builtin(local_invocation_index) local_invocation_index: u32
    ) {
      let workgroup_index =
        workgroup_id.x +
        workgroup_id.y * num_workgroups.x +
        workgroup_id.z * num_workgroups.x * num_workgroups.y;

      let i = workgroup_index * ${INIT_GROUP_SIZE} + local_invocation_index;
      seed(computeUniforms.seed ^ hash(i));
      // uniform disk
      let r = sqrt(random());
      let theta = random() * 2 * PI;
      points[i].position = r * vec2f(cos(theta), sin(theta));
    }
  `

  const initPointsModule = device.createShaderModule({
    code: initPointsShaderCode,
  })

  const initPointsPipeline = device.createComputePipeline({
    layout: device.createPipelineLayout({
      bindGroupLayouts: [root.unwrap(bindGroupLayout)],
    }),
    compute: {
      module: initPointsModule,
    },
  })

  return (pass: GPUComputePassEncoder, pointCount: number) => {
    pass.setPipeline(initPointsPipeline)
    pass.setBindGroup(0, root.unwrap(bindGroup))
    pass.dispatchWorkgroups(
      pointCount / (INIT_GROUP_SIZE * INIT_GROUP_SIZE),
      INIT_GROUP_SIZE,
      1,
    )
  }
}
