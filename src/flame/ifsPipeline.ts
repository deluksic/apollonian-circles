import { CameraContext } from '@/lib/CameraContext'
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
  outputTexture: {
    storageTexture: 'r32uint',
    access: 'mutable',
    visibility: ['compute'],
  },
})

export function createIFSPipeline(
  root: TgpuRoot,
  camera: CameraContext,
  points: TgpuBuffer<WgslArray<typeof Point>> & StorageFlag,
  outputTexture: LayoutEntryToInput<
    (typeof bindGroupLayout)['entries']['outputTexture']
  >,
  computeUniforms: LayoutEntryToInput<
    (typeof bindGroupLayout)['entries']['computeUniforms']
  >,
) {
  const { device } = root

  const bindGroup = root.createBindGroup(bindGroupLayout, {
    points,
    outputTexture,
    computeUniforms,
  })

  const ifsShaderCode = wgsl/* wgsl */ `
    ${{
      ...camera.BindGroupLayout.bound,
      ...bindGroupLayout.bound,
      worldToClip: camera.wgsl.worldToClip,
      hash,
    }}

    fn draw(position: vec2f) {
      let outputTextureSize = vec2f(textureDimensions(outputTexture));
      let clip = worldToClip(position);
      let pixelPosition = vec2i(0.5 * (clip * vec2f(1, -1) + 1) * outputTextureSize);
      let prevCount = textureLoad(outputTexture, pixelPosition);
      textureStore(outputTexture, pixelPosition, prevCount + 1);
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

      let global_invocation_index = workgroup_index * ${IFS_GROUP_SIZE} + local_invocation_index;

      var position = points[global_invocation_index].position;

      // let speed = vec2f(-position.y, position.x);
      // position += 0.0005 * speed / dot(speed, speed);
      // let affine = mat3x2f(1, 0, 0, 1, 0, 0);
      let affine1 = mat3x2f(0.5, 0,   0, 0.5,   0.5, 0);
      let affine2 = mat3x2f(0.5, 0,   0, 0.5,   0, 0.5);
      let affine3 = mat3x2f(0.5, 0,   0, 0.5,   -0.5, -0.5);
      let trans = array(affine1, affine2, affine3);

      var seed = computeUniforms.seed ^ hash(workgroup_index);
      for(var i = 0; i < 20; i += 1) {
        seed = hash(seed);
        let affine = trans[seed % 3];
        position = affine * vec3f(position, 1.);
        if (i >= 5) {
          draw(position);
        }
      }
    }
  `

  const ifsModule = device.createShaderModule({
    code: ifsShaderCode,
  })

  const ifsPipeline = device.createComputePipeline({
    layout: device.createPipelineLayout({
      bindGroupLayouts: [
        root.unwrap(camera.BindGroupLayout),
        root.unwrap(bindGroupLayout),
      ],
    }),
    compute: {
      module: ifsModule,
    },
  })

  return (pass: GPUComputePassEncoder, pointCount: number) => {
    pass.setPipeline(ifsPipeline)
    pass.setBindGroup(0, root.unwrap(camera.bindGroup))
    pass.setBindGroup(1, root.unwrap(bindGroup))
    pass.dispatchWorkgroups(
      pointCount / (IFS_GROUP_SIZE * IFS_GROUP_SIZE),
      IFS_GROUP_SIZE,
      1,
    )
  }
}
