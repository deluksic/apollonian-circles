import { wgsl } from './wgsl'
import { gamutClipPreserveChroma } from '@/flame/oklab'

export async function fragmentShaderToImage(width: number, height: number) {
  const canvas = new OffscreenCanvas(width, height)
  const ctx = canvas.getContext('webgpu')
  if (!ctx) {
    throw new Error(`Failed to create WebGPU context`)
  }
  const adapter = await navigator.gpu.requestAdapter({
    powerPreference: 'low-power',
  })
  const device = await adapter?.requestDevice()
  if (!device) {
    throw new Error(`Failed to get GPUDevice`)
  }
  const format = navigator.gpu.getPreferredCanvasFormat()
  ctx.configure({
    device,
    format,
  })

  const renderShaderCode = wgsl/* wgsl */ `
      ${{
        gamutClipPreserveChroma,
      }}
  
      const pos = array(
        vec2f(-1, -1),
        vec2f(3, -1),
        vec2f(-1, 3)
      );
  
      struct VertexOutput {
        @builtin(position) pos: vec4f,
        @location(0) uv: vec2f
      }
  
      @vertex fn vs(
        @builtin(vertex_index) vertexIndex : u32
      ) -> VertexOutput {
        return VertexOutput(
          vec4f(pos[vertexIndex], 0.0, 1.0), 
          pos[vertexIndex]
        );
      }

      fn clampLength(v: vec2f, maxLength: f32) -> vec2f {
        const eps = 0.0001;
        let l = length(v);
        return min(l, maxLength) * v / max(eps, l);
      }

      @fragment fn fs(in: VertexOutput) -> @location(0) vec4f {
        return vec4f(gamutClipPreserveChroma(vec3f(0.75, 0.3 * in.uv)), 1);
      }
    `

  const renderModule = device.createShaderModule({
    code: renderShaderCode,
  })

  const renderPipeline = device.createRenderPipeline({
    layout: device.createPipelineLayout({
      bindGroupLayouts: [],
    }),
    vertex: {
      module: renderModule,
    },
    fragment: {
      module: renderModule,
      targets: [
        {
          format,
        },
      ],
    },
  })

  const encoder = device.createCommandEncoder()
  const pass = encoder.beginRenderPass({
    colorAttachments: [
      {
        view: ctx.getCurrentTexture().createView(),
        loadOp: 'clear',
        storeOp: 'store',
      },
    ],
  })
  pass.setPipeline(renderPipeline)
  pass.draw(3)
  pass.end()
  device.queue.submit([encoder.finish()])

  return URL.createObjectURL(await canvas.convertToBlob())
}
