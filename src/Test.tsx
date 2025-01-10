import { createMemo } from 'solid-js'
import { createAnimationFrame } from './utils/createAnimationFrame'
import { TestFrag, VertexOutput } from './frags'
import { wgsl } from './utils/wgsl'
import { struct, v2f, vec2f } from 'typegpu/data'
import tgpu from 'typegpu/experimental'
import { useRootContext } from './lib/RootContext'
import { useCanvas } from './lib/CanvasContext'
import { premultipliedAlphaBlend } from './utils/blendModes'
import { useCamera } from './CameraContext'

const Uniforms = struct({
  translation: vec2f,
})

const uniformBindGroupLayout = tgpu.bindGroupLayout({
  uniforms: { uniform: Uniforms },
})

export function Test(props: {
  clearColor: GPUColor
  translation: v2f
  frag: TestFrag
}) {
  const { positionTransform, ...camera } = useCamera()
  const { root, device } = useRootContext()
  const { context } = useCanvas()

  const uniformsBuffer = root
    .createBuffer(Uniforms)
    .$usage('uniform')
    .$name('Uniforms bind group')

  const stuff = createMemo(() => {
    const shaderCode = wgsl/* wgsl */ `
      ${{
        VertexOutput,
        frag: props.frag,
        positionTransform,
        ...camera.BindGroupLayout.bound,
        ...uniformBindGroupLayout.bound,
      }}

      @vertex fn vs(
        @builtin(vertex_index) vertexIndex : u32,
        @builtin(instance_index) instanceIndex : u32,
      ) -> VertexOutput {
        let pos = array(
          vec2f( 0.0,  0.5),  // top center
          vec2f(-0.5, -0.5),  // bottom left
          vec2f( 0.5, -0.5),   // bottom right
        );
        let p = pos[vertexIndex] + uniforms.translation * (2 * f32(instanceIndex) - 1);
        let clip = positionTransform(p);

        var out: VertexOutput;
        out.position = vec4f(clip.xy / clip.z, 0, 1);
        out.positionOriginal = pos[vertexIndex];
        return out;
      }

      @fragment fn fs(in: VertexOutput) -> @location(0) vec4f {
        let color = frag(in);
        return vec4f(color.rgb * color.a, color.a);
      }
    `

    const module = device.createShaderModule({
      label: 'our hardcoded red triangle shaders',
      code: shaderCode,
    })
    const pipeline = device.createRenderPipeline({
      label: 'our hardcoded red triangle pipeline',
      layout: device.createPipelineLayout({
        bindGroupLayouts: [
          root.unwrap(camera.BindGroupLayout),
          root.unwrap(uniformBindGroupLayout),
        ],
      }),
      vertex: {
        entryPoint: 'vs',
        module,
      },
      fragment: {
        entryPoint: 'fs',
        module,
        targets: [
          {
            format: navigator.gpu.getPreferredCanvasFormat(),
            blend: premultipliedAlphaBlend,
          },
        ],
      },
    })

    const uniformBindGroup = uniformBindGroupLayout.populate({
      uniforms: uniformsBuffer,
    })

    return { pipeline, uniformBindGroup }
  })

  const render = () => {
    const { pipeline, uniformBindGroup } = stuff()
    // Get the current texture from the canvas context and
    // set it as the texture to render to.
    const view = context.getCurrentTexture().createView()
    uniformsBuffer.write({ translation: props.translation })
    camera.update()

    // make a command encoder to start encoding commands
    const encoder = device.createCommandEncoder()

    // make a render pass encoder to encode render specific commands
    const pass = encoder.beginRenderPass({
      label: 'our basic canvas renderPass',
      colorAttachments: [
        {
          clearValue: props.clearColor,
          loadOp: 'clear',
          storeOp: 'store',
          view,
        },
      ],
    })
    pass.setPipeline(pipeline)
    pass.setBindGroup(0, root.unwrap(camera.bindGroup))
    pass.setBindGroup(1, root.unwrap(uniformBindGroup))
    pass.draw(3, 2) // call our vertex shader 3 times
    pass.end()

    const commandBuffer = encoder.finish()
    device.queue.submit([commandBuffer])
  }

  createAnimationFrame(render)

  return null
}
