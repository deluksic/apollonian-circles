import { hash } from '@/shaders/random'
import { wgsl } from '@/utils/wgsl'
import tgpu, {
  LayoutEntryToInput,
  StorageFlag,
  TgpuBuffer,
  TgpuRoot,
} from 'typegpu'
import { arrayOf, struct, u32, WgslArray } from 'typegpu/data'
import { Point } from './types'

const { ceil } = Math
const IFS_GROUP_SIZE = 32

export const ComputeUniforms = struct({
  seed: u32,
})

const bindGroupLayout = tgpu.bindGroupLayout({
  points: {
    storage: (length: number) => arrayOf(Point, length),
    access: 'mutable',
  },
  computeUniforms: {
    uniform: ComputeUniforms,
  },
})

const outerIterationBindGroupLayout = tgpu.bindGroupLayout({
  outerIterationIndex: {
    uniform: u32,
  },
})

export function createIFSPipeline(
  root: TgpuRoot,
  outerIterCount: number,
  insideShaderCount: number,
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

  const perOuterIterationBindGroups = Array.from({
    length: outerIterCount,
  }).map((_, i) =>
    root.createBindGroup(outerIterationBindGroupLayout, {
      outerIterationIndex: root.createBuffer(u32, i).$usage('uniform'),
    }),
  )

  const ifsShaderCode = wgsl/* wgsl */ `
    ${{
      ...bindGroupLayout.bound,
      ...outerIterationBindGroupLayout.bound,
      hash,
    }}

    const ITER_COUNT = ${insideShaderCount};

    const affine1 = mat3x2f(0.5, 0,   0, 0.5,   0.5, 0);
    const affine2 = mat3x2f(0.5, 0,   0, 0.5,   0, 0.5);
    const affine3 = mat3x2f(0.5, 0,   0, 0.5,   -0.5, -0.5);
    const trans = array(affine1, affine2, affine3);

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

      var position = points[i].position;

      var seed = computeUniforms.seed ^ hash(workgroup_index) ^ hash(outerIterationIndex);
      for (var i = 0; i < ITER_COUNT; i += 1) {
        seed = hash(seed);
        let affine = trans[seed % 3];
        position = (affine * vec3f(position, 1.)).xy;
      }

      points[i].position = position;
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
        `Requested more iterations (${iteration}) than initially specified ${outerIterCount}.`,
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
