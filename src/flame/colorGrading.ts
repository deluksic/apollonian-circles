import { wgsl } from '@/utils/wgsl'
import { TgpuRoot } from 'typegpu'
import { BindGroupFor, bindGroupLayout } from './types'
import { premultipliedAlphaBlend } from '@/utils/blendModes'

export function createColorGradingPipeline(
  root: TgpuRoot,
  bindGroup: BindGroupFor<typeof bindGroupLayout>,
) {
  const { device } = root
  const renderShaderCode = wgsl/* wgsl */ `
    ${{
      outputTexture: bindGroupLayout.bound.outputTexture,
    }}

    @vertex fn vs(
      @builtin(vertex_index) vertexIndex : u32
    ) -> @builtin(position) vec4f {
      let pos = array(
        vec2f(-1, -1),
        vec2f(3, -1),
        vec2f(-1, 3)
      );

      return vec4f(pos[vertexIndex], 0.0, 1.0);
    }

    @fragment fn fs(@builtin(position) pos: vec4f) -> @location(0) vec4f {
      let pos2u = vec2u(pos.xy);
      let count = f32(textureLoad(outputTexture, pos2u).x);
      return vec4f(vec3f(count / 10, count / 12, count / 20), count / 10);
    }
  `

  const renderModule = device.createShaderModule({
    code: renderShaderCode,
  })

  const renderPipeline = device.createRenderPipeline({
    layout: device.createPipelineLayout({
      bindGroupLayouts: [root.unwrap(bindGroupLayout)],
    }),
    vertex: {
      module: renderModule,
    },
    fragment: {
      module: renderModule,
      targets: [
        {
          format: navigator.gpu.getPreferredCanvasFormat(),
          blend: premultipliedAlphaBlend,
        },
      ],
    },
  })
  return (encoder: GPUCommandEncoder, context: GPUCanvasContext) => {
    const pass = encoder.beginRenderPass({
      colorAttachments: [
        {
          loadOp: 'clear',
          storeOp: 'store',
          clearValue: [0, 0, 0, 1],
          view: context.getCurrentTexture().createView(),
        },
      ],
    })
    pass.setPipeline(renderPipeline)
    pass.setBindGroup(0, root.unwrap(bindGroup))
    pass.draw(3, 1)
    pass.end()
  }
}
