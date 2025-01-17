import { createEffect, createMemo } from 'solid-js'
import { createAnimationFrame } from '../utils/createAnimationFrame'
import { wgsl } from '../utils/wgsl'
import {
  arrayOf,
  f32,
  struct,
  vec2f,
  Infer,
  vec4f,
  u32,
  builtin,
  location,
  interpolate,
  sizeOf,
} from 'typegpu/data'
import tgpu from 'typegpu'
import { useRootContext } from '../lib/RootContext'
import { useCanvas } from '../lib/CanvasContext'
import { premultipliedAlphaBlend } from '../utils/blendModes'
import { CameraContext, useCamera } from '../lib/CameraContext'

const VertexOutput = struct({
  position: builtin.position,
  positionOriginal: location(0, vec2f),
  innerRatio: location(1, f32),
  styleIndex: location(2, interpolate('flat, either', u32)),
})

type Circle = Infer<typeof Circle>
const Circle = struct({
  center: vec2f,
  radius: f32,
  styleIndex: u32,
}).$name('Circle')

export type CircleStyle = Infer<typeof CircleStyle>
const CircleStyle = struct({
  rimColor: vec4f,
  fadeColor: vec4f,
})

const N = 100000
const SUBDIVS = 24

const uniformBindGroupLayout = tgpu.bindGroupLayout({
  circles: { storage: (length) => arrayOf(Circle, length) },
  styles: { storage: (length) => arrayOf(CircleStyle, length) },
})

const linearstep = tgpu['~unstable'].fn([f32, f32, f32], f32).does(/* wgsl */ `
  (edge0: f32, edge1: f32, x: f32) -> f32 {
    return clamp((x - edge0) / (edge1 - edge0), 0.0, 1.0);
  }`)

const circleVertexShader = (camera: CameraContext) =>
  tgpu['~unstable']
    .fn([u32, u32], VertexOutput)
    .does(
      /* wgsl */ `
    (vertexIndex: u32, instanceIndex: u32) -> VertexOutput {
      const SUBDIVS = ${SUBDIVS};
      const WEDGE_ANGLE = radians(360.0) / SUBDIVS;
      const MIN_INNER_RADIUS = 0.5;
      const MAX_INNER_RADIUS = 0.95;
      const OVERSIZE_FACTOR = 1.01;

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
      out.styleIndex = circle.styleIndex;
      return out;
    }
  `,
    )
    .$uses({
      ...camera.BindGroupLayout.bound,
      circles: uniformBindGroupLayout.bound.circles,
      worldToClip: camera.wgsl.worldToClip,
      clipToPixels: camera.wgsl.clipToPixels,
    })

const fadeFragmentShader = tgpu['~unstable']
  .fn([VertexOutput], vec4f)
  .does(
    /* wgsl */ `
    (in: VertexOutput) -> vec4f {
      const OUTER_RADIUS = 1.0;
      let style = styles[in.styleIndex];
      let dist = length(in.positionOriginal);
      let distWidth = fwidth(dist);
      // adding half a distWidth in order for circles to touch fully
      let disk = clamp((0.5*distWidth + OUTER_RADIUS - dist) / distWidth, 0, 1);
      let fade = linearstep(in.innerRatio, OUTER_RADIUS, dist);
      let fadeEaseIn = fade * fade;
      return (
        mix(style.fadeColor, style.rimColor, fadeEaseIn) *
        vec4f(1, 1, 1, disk * fadeEaseIn)
      );
    }
  `,
  )
  .$uses({
    styles: uniformBindGroupLayout.bound.styles,
    linearstep,
  })

type CirclesProps = {
  circles: Circle[]
  styles: CircleStyle[]
  color?: CircleStyle
  clearColor?: [number, number, number, number]
}

export function Circles(props: CirclesProps) {
  const camera = useCamera()
  const { root, device } = useRootContext()
  const { context } = useCanvas()

  const circlesBuffer = root
    .createBuffer(arrayOf(Circle, N))
    .$usage('storage')
    .$name('circles')

  // TODO switch to this version when typegpu is fast
  // createEffect(() => {
  //   const { circles } = props
  //   circlesBuffer.write(circles)
  // })

  createEffect(() => {
    const { circles } = props
    const circleSize = sizeOf(Circle)
    const view = new DataView(new ArrayBuffer(circleSize * circles.length))
    for (let i = 0, offset = 0; i < circles.length; ++i, offset += circleSize) {
      const circle = circles[i]!
      view.setFloat32(offset + 0, circle.center[0]!, true)
      view.setFloat32(offset + 4, circle.center[1]!, true)
      view.setFloat32(offset + 8, circle.radius, true)
      view.setUint32(offset + 12, circle.styleIndex, true)
    }
    device.queue.writeBuffer(
      circlesBuffer.buffer,
      0,
      view,
      0,
      view.buffer.byteLength,
    )
  })

  const colorBuffer = root
    .createBuffer(CircleStyle)
    .$usage('uniform')
    .$name('color')

  createEffect(() => {
    colorBuffer.write(
      props.color ?? {
        rimColor: vec4f(0, 0, 0, 1),
        fadeColor: vec4f(0, 0, 0, 1),
      },
    )
  })

  const stylesBuffer = root
    .createBuffer(arrayOf(CircleStyle, props.styles.length))
    .$usage('storage')
    .$name('styles')

  createEffect(() => {
    stylesBuffer.write(props.styles)
  })

  const stuff = createMemo(() => {
    const shaderCode = wgsl/* wgsl */ `
      ${{
        VertexOutput,
        vert: circleVertexShader(camera),
        frag: fadeFragmentShader,
      }}

      @vertex fn vs(
        @builtin(vertex_index) vertexIndex: u32,
        @builtin(instance_index) instanceIndex: u32,
      ) -> VertexOutput {
        return vert(vertexIndex, instanceIndex);
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

    const uniformBindGroup = root.createBindGroup(uniformBindGroupLayout, {
      circles: circlesBuffer.buffer,
      styles: stylesBuffer.buffer,
    })

    return { pipeline, uniformBindGroup }
  })

  const render = () => {
    const { circles } = props
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
    if (circles.length > 0) {
      pass.draw((SUBDIVS + 1) * 2, circles.length)
    }
    pass.end()

    const commandBuffer = encoder.finish()
    device.queue.submit([commandBuffer])
  }

  createAnimationFrame(render)

  return null
}
