import { hash, randomU, seed } from '@/shaders/random'
import { wgsl } from '@/utils/wgsl'
import tgpu, {
  LayoutEntryToInput,
  StorageFlag,
  TgpuBuffer,
  TgpuRoot,
} from 'typegpu'
import { arrayOf, struct, u32, WgslArray } from 'typegpu/data'
import { AffineParams, Point, transformAffine } from './types'
import { transformFunctions } from './transformFunctions'

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
  maxOuterIterCount: number,
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
      Point,
      hash,
      seed,
      randomU,
      linear: transformFunctions.linear.fn,
      swirl: transformFunctions.swirl.fn,
      popcorn: transformFunctions.popcorn.fn,
      gaussian: transformFunctions.gaussian.fn,
      AffineParams,
      transformAffine,
    }}

    const ITER_COUNT = ${insideShaderCount};

    const affine0 = AffineParams(0.8, 0, 0.5, 0, 0.6, 0.0);
    const color0 = vec2f(0.25, 0.5);

    fn flame0(point: Point) -> Point {
      let pre = transformAffine(affine0, point.position);
      var p = vec2f(0);
      p += linear(pre);
      p /= 1;
      // p = transformAffine(affine0, p);
      let color = mix(point.color, color0, 0.5);
      return Point(p, color);
    }

    const affine1 = AffineParams(0.7, 0.3, 0.1, 0, 0.6, 0.5);
    const color1 = vec2f(-0.4, 0.1);

    fn flame1(point: Point) -> Point {
      let pre = transformAffine(affine1, point.position);
      var p = vec2f(0);
      p += 0.4 * linear(pre);
      p += 0.5 * swirl(pre);
      p += 0.1 * popcorn(pre, affine1);
      // p = transformAffine(affine1, p);
      let color = mix(point.color, color1, 0.5);
      return Point(p, color);
    }

    const affine2 = AffineParams(0.6, 0.5, -0.5, 0, 0.5, -0.5);
    const color2 = vec2f(0, -0.5);

    fn flame2(point: Point) -> Point {
      let pre = transformAffine(affine2, point.position);
      var p = vec2f(0);
      p += 0.95 * linear(pre);
      p += 0.05 * gaussian(pre);
      // p = transformAffine(affine2, p);
      let color = mix(point.color, color2, 0.5);
      return Point(p, color);
    }

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
        let flameIndex = randomU() % 10;
        if (flameIndex < 5) {
          point = flame0(point);
        } else if (flameIndex < 9) {
          point = flame1(point);
        } else {
          point = flame2(point);
        }
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
