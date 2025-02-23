import { random } from '@/shaders/random'
import { BindGroupFor, bindGroupLayout } from './types'
import { wgsl } from '@/utils/wgsl'
import { TgpuRoot } from 'typegpu'

const INIT_GROUP_SIZE = 32

export function createInitPointsPipeline(
  root: TgpuRoot,
  bindGroup: BindGroupFor<typeof bindGroupLayout>,
  pointCount: number,
) {
  const { device } = root
  const initPointsShaderCode = wgsl/* wgsl */ `
    ${{ ...bindGroupLayout.bound, random }}

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
      points[i].position = vec2f(
        random(i) + random(i << 4) + random(i << 8),
        random(i << 5) + random(i << 9) + random(i << 17)
      ) / 3 - 0.5;
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

  return (pass: GPUComputePassEncoder) => {
    pass.setPipeline(initPointsPipeline)
    pass.setBindGroup(0, root.unwrap(bindGroup))
    pass.dispatchWorkgroups(
      pointCount / (INIT_GROUP_SIZE * INIT_GROUP_SIZE),
      INIT_GROUP_SIZE,
      1,
    )
  }
}
