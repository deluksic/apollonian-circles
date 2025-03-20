import { AutoCanvas } from '@/lib/AutoCanvas'
import { Root } from '@/lib/Root'
import { WheelZoomCamera2D } from '@/lib/WheelZoomCamera2D'
import ui from './AffineEditor.module.css'
import { useCamera } from '@/lib/CameraContext'
import { useRootContext } from '@/lib/RootContext'
import { createEffect, createMemo, createSignal, For } from 'solid-js'
import { createAnimationFrame } from '@/utils/createAnimationFrame'
import { gamutClipPreserveChroma } from '@/flame/oklab'
import { wgsl } from '@/utils/wgsl'
import { useCanvas } from '@/lib/CanvasContext'
import { PI } from '@/flame/constants'
import { v2f, vec2f } from 'typegpu/data'
import { createDragHandler } from '@/utils/createDragHandler'
import { eventToClip } from '@/utils/eventToClip'
import { vec2 } from 'wgpu-matrix'
import { FlameFunction } from '@/flame/flameFunction'
import { produce, SetStoreFunction } from 'solid-js/store'

function Grid() {
  const camera = useCamera()
  const { device, root } = useRootContext()
  const { context } = useCanvas()

  createEffect(() => {
    const renderShaderCode = wgsl/* wgsl */ `
      ${{
        clipToWorld: camera.wgsl.clipToWorld,
        gamutClipPreserveChroma,
        PI,
      }}

      const pos = array(
        vec2f(-1, -1),
        vec2f(3, -1),
        vec2f(-1, 3)
      );

      struct VertexOutput {
        @builtin(position) pos: vec4f,
        @location(0) clip: vec2f
      }

      @vertex fn vs(
        @builtin(vertex_index) vertexIndex : u32
      ) -> VertexOutput {
        return VertexOutput(
          vec4f(pos[vertexIndex], 0.0, 1.0), 
          pos[vertexIndex]
        );
      }

      fn triangle(x: f32) -> f32 {
        return abs(fract(x - 0.5) - 0.5);
      }

      fn lines(x: f32, pxWidth: f32) -> f32 {
        return saturate(2 * (2 * pxWidth - x) / pxWidth);
      }

      @fragment fn fs(in: VertexOutput) -> @location(0) vec4f {
        let worldPos = clipToWorld(in.clip);
        let pxWidth = dpdx(worldPos.x);

        let minorV = lines(triangle(10 * worldPos.x), 10 * pxWidth);
        let minorH = lines(triangle(10 * worldPos.y), 10 * pxWidth);
        let minor = max(minorH, minorV);

        let majorV = lines(triangle(worldPos.x), pxWidth);
        let majorH = lines(triangle(worldPos.y), pxWidth);
        let major = max(majorH, majorV);

        let axisV = lines(abs(worldPos.x), pxWidth);
        let axisH = lines(abs(worldPos.y), pxWidth);
        let axis = max(axisH, axisV);

        let gray = max(0.4 * axis, max(0.05 * minor, 0.15 * major));
        return vec4f(0.04 + vec3f(gray), 1);
      }
    `

    const renderModule = device.createShaderModule({
      code: renderShaderCode,
    })

    const renderPipeline = device.createRenderPipeline({
      layout: device.createPipelineLayout({
        bindGroupLayouts: [root.unwrap(camera.BindGroupLayout)],
      }),
      vertex: {
        module: renderModule,
      },
      fragment: {
        module: renderModule,
        targets: [
          {
            format: navigator.gpu.getPreferredCanvasFormat(),
          },
        ],
      },
    })

    createAnimationFrame(() => {
      camera.update()

      const encoder = device.createCommandEncoder()
      const pass = encoder.beginRenderPass({
        colorAttachments: [
          {
            view: context.getCurrentTexture().createView(),
            loadOp: 'clear',
            storeOp: 'store',
          },
        ],
      })
      pass.setBindGroup(0, root.unwrap(camera.bindGroup))
      pass.setPipeline(renderPipeline)
      pass.draw(3)
      pass.end()
      device.queue.submit([encoder.finish()])
    })
  })
  return null
}

function AffineHandle(props: {
  position: v2f
  color: v2f
  setPosition: (pos: v2f) => void
}) {
  const { canvas } = useCanvas()
  const {
    js: { worldToClip, clipToWorld },
  } = useCamera()
  const clip = createMemo(() => worldToClip(props.position))
  const startDragging = createDragHandler((initEvent) => {
    const initialColor = props.position
    const grabPosition = clipToWorld(eventToClip(initEvent, canvas))
    return {
      onPointerMove(ev) {
        const evPosition = clipToWorld(eventToClip(ev, canvas))
        const diff = vec2.sub(evPosition, grabPosition, vec2f())
        const position = vec2.add(initialColor, diff, vec2f())
        props.setPosition(position)
      },
    }
  })
  return (
    <g
      class={ui.handle}
      // TODO: temporarily using on:pointerdown and not onPointerDown
      // because otherwise WheelZoomCamera2D steals the event
      // due to solidjs event delegation.
      on:pointerdown={startDragging}
    >
      <circle
        class={ui.handleCircle}
        cx={`${(50 * (clip().x + 1)).toFixed(4)}%`}
        cy={`${(50 * (1 - clip().y)).toFixed(4)}%`}
        style={{ '--a': props.color.x, '--b': props.color.y }}
      />
      <circle
        class={ui.handleCircleGrabArea}
        cx={`${(50 * (clip().x + 1)).toFixed(4)}%`}
        cy={`${(50 * (1 - clip().y)).toFixed(4)}%`}
      />
    </g>
  )
}

export function AffineEditor(props: {
  flameFunctions: FlameFunction[]
  setFlameFunctions: SetStoreFunction<FlameFunction[]>
}) {
  const [div, setDiv] = createSignal<HTMLDivElement>()
  return (
    <div ref={setDiv} class={ui.editorCard}>
      <Root adapterOptions={{ powerPreference: 'high-performance' }}>
        <AutoCanvas class={ui.canvas} pixelRatio={1}>
          <WheelZoomCamera2D
            eventTarget={div()}
            initZoom={1}
            zoomRange={[0.5, 20]}
          >
            <Grid />
            <svg class={ui.svg}>
              <For each={props.flameFunctions}>
                {(flameFunction, i) => (
                  <AffineHandle
                    position={vec2f(
                      flameFunction.preAffine.c,
                      flameFunction.preAffine.f,
                    )}
                    color={vec2f(flameFunction.color.x, flameFunction.color.y)}
                    setPosition={(pos) =>
                      props.setFlameFunctions(
                        i(),
                        'preAffine',
                        produce((T) => {
                          T.c = pos.x
                          T.f = pos.y
                        }),
                      )
                    }
                  />
                )}
              </For>
            </svg>
          </WheelZoomCamera2D>
        </AutoCanvas>
      </Root>
    </div>
  )
}
