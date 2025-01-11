import { createEffect, createMemo } from 'solid-js'
import { createAnimationFrame } from '../utils/createAnimationFrame'
import { TestFrag, VertexOutput } from '../frags'
import { wgsl } from '../utils/wgsl'
import { arrayOf, f32, struct, vec2f, Infer } from 'typegpu/data'
import tgpu from 'typegpu/experimental'
import { useRootContext } from '../lib/RootContext'
import { useCanvas } from '../lib/CanvasContext'
import { premultipliedAlphaBlend } from '../utils/blendModes'
import { useCamera } from '../lib/CameraContext'

const Circle = struct({
  center: vec2f,
  radius: f32,
}).$name('Circle')
type Circle = Infer<typeof Circle>

const N = 10000
const SUBDIVS = 24

const uniformBindGroupLayout = tgpu.bindGroupLayout({
  circles: { storage: (length) => arrayOf(Circle, length) },
})

type CirclesProps = {
  frag: TestFrag
  circles: Circle[]
  clearColor?: [number, number, number, number]
}

export function Circles(props: CirclesProps) {
  const {
    wgsl: { worldToClip, clipToPixels },
    ...camera
  } = useCamera()
  const { root, device } = useRootContext()
  const { context } = useCanvas()

  const circlesBuffer = root
    .createBuffer(arrayOf(Circle, N))
    .$usage('storage')
    .$name('Circles')

  createEffect(() => {
    circlesBuffer.write(props.circles)
  })

  const stuff = createMemo(() => {
    const shaderCode = wgsl/* wgsl */ `
      ${{
        VertexOutput,
        frag: props.frag,
        worldToClip,
        clipToPixels,
        ...camera.BindGroupLayout.bound,
        ...uniformBindGroupLayout.bound,
      }}

      const SUBDIVS = ${SUBDIVS};
      const WEDGE_ANGLE = radians(360.0) / SUBDIVS;
      const MIN_INNER_RADIUS = 0.5;
      const MAX_INNER_RADIUS = 0.95;
      const OVERSIZE_FACTOR = 1.01;

      @vertex fn vs(
        @builtin(vertex_index) vertexIndex : u32,
        @builtin(instance_index) instanceIndex : u32,
      ) -> VertexOutput {
        let circle = circles[instanceIndex];
        let angle = f32(vertexIndex / 2) * WEDGE_ANGLE;
        let unitCircle = vec2f(cos(angle), sin(angle));
        let clip0 = worldToClip(circle.center);
        let clip1 = worldToClip(circle.center + unitCircle * circle.radius);
        let lengthPX = length(clipToPixels(clip1 - clip0));
        let innerRatio = clamp(1 - 20 / lengthPX, MIN_INNER_RADIUS, MAX_INNER_RADIUS);
        let ratio = select(innerRatio, OVERSIZE_FACTOR, vertexIndex % 2 == 0);
        let clip = mix(clip0, clip1, ratio);

        var out: VertexOutput;
        out.position = vec4f(clip, 0, 1);
        out.positionOriginal = mix(vec2f(0,0), unitCircle, ratio);
        out.innerRatio = innerRatio;
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
      primitive: {
        topology: 'triangle-strip',
      },
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
      circles: circlesBuffer.buffer,
    })

    return { pipeline, uniformBindGroup }
  })

  const render = () => {
    const { pipeline, uniformBindGroup } = stuff()
    // Get the current texture from the canvas context and
    // set it as the texture to render to.
    const view = context.getCurrentTexture().createView()
    camera.update()

    // make a command encoder to start encoding commands
    const encoder = device.createCommandEncoder()

    // make a render pass encoder to encode render specific commands
    const pass = encoder.beginRenderPass({
      label: 'our basic canvas renderPass',
      colorAttachments: [
        {
          clearValue: props.clearColor ?? [1, 1, 1, 1],
          loadOp: 'clear',
          storeOp: 'store',
          view,
        },
      ],
    })
    pass.setPipeline(pipeline)
    pass.setBindGroup(0, root.unwrap(camera.bindGroup))
    pass.setBindGroup(1, root.unwrap(uniformBindGroup))
    if (props.circles.length > 0) {
      pass.draw((SUBDIVS + 1) * 2, props.circles.length)
    }
    pass.end()

    const commandBuffer = encoder.finish()
    device.queue.submit([commandBuffer])
  }

  createAnimationFrame(render)

  return null
}