import { wgsl } from '@/utils/wgsl'
import tgpu, { LayoutEntryToInput, TgpuRoot } from 'typegpu'
import { premultipliedAlphaBlend } from '@/utils/blendModes'
import { f32, struct } from 'typegpu/data'

export const ColorGradingUniforms = struct({
  accumulatedIterationCount: f32,
  zoom: f32,
})

const bindGroupLayout = tgpu.bindGroupLayout({
  uniforms: {
    uniform: ColorGradingUniforms,
  },
  outputTexture: {
    texture: 'unfilterable-float',
    visibility: ['fragment'],
  },
})

export function createColorGradingPipeline(
  root: TgpuRoot,
  uniforms: LayoutEntryToInput<(typeof bindGroupLayout)['entries']['uniforms']>,
  outputTexture: LayoutEntryToInput<
    (typeof bindGroupLayout)['entries']['outputTexture']
  >,
) {
  const { device } = root

  const bindGroup = root.createBindGroup(bindGroupLayout, {
    uniforms,
    outputTexture,
  })

  const renderShaderCode = wgsl/* wgsl */ `
    ${{
      ...bindGroupLayout.bound,
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
      let factor = clamp(0, 40, uniforms.zoom * uniforms.zoom / uniforms.accumulatedIterationCount);
      let count = f32(textureLoad(outputTexture, pos2u, 0).a) * factor;
      return vec4f(vec3f(count / 20, count / 24, count / 40), 1);
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
