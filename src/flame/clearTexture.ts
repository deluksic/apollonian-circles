import { TgpuBindGroup, TgpuRoot, TgpuTexture } from 'typegpu'
import { wgsl } from '@/utils/wgsl'

const { ceil } = Math

const CLEAR_GROUP_SIZE = 8

export function createClearTexturePipeline(
  root: TgpuRoot,
  bindGroup: TgpuBindGroup,
  texture: TgpuTexture,
) {
  const { device } = root
  const clearTextureBufferShaderCode = wgsl/* wgsl */ `
      ${{ ...bindGroup.layout.bound }}

      fn ceildiv(x: u32, y: u32) -> u32 {
        return x / y + u32(x % y != 0);
      }

      @compute @workgroup_size(${CLEAR_GROUP_SIZE}, ${CLEAR_GROUP_SIZE}, 1) fn computeSomething(
        @builtin(workgroup_id) workgroup_id : vec3u,
        @builtin(local_invocation_id) local_invocation_id: vec3u
      ) {
        let pixelPosition = workgroup_id.xy * vec2u(${CLEAR_GROUP_SIZE}) + local_invocation_id.xy;
        let prev = textureLoad(outputTexture, pixelPosition).x;
        textureStore(outputTexture, pixelPosition, vec4u(prev - ceildiv(prev, 12)));
        // // uncomment to clear fully
        // textureStore(outputTexture, pixelPosition, vec4u(0));
      }
    `

  const clearTextureBufferModule = device.createShaderModule({
    code: clearTextureBufferShaderCode,
  })

  const clearTexturePipeline = device.createComputePipeline({
    layout: device.createPipelineLayout({
      bindGroupLayouts: [root.unwrap(bindGroup.layout)],
    }),
    compute: {
      module: clearTextureBufferModule,
    },
  })

  return (pass: GPUComputePassEncoder) => {
    const [width, height] = texture.props.size as [number, number]
    pass.setPipeline(clearTexturePipeline)
    pass.setBindGroup(0, root.unwrap(bindGroup))
    pass.dispatchWorkgroups(
      ceil(width / CLEAR_GROUP_SIZE),
      ceil(height / CLEAR_GROUP_SIZE),
      1,
    )
  }
}
