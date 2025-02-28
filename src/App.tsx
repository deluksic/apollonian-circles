import ui from './App.module.css'
import * as d from 'typegpu/data'
import { AutoCanvas } from './lib/AutoCanvas'
import { useCanvas } from './lib/CanvasContext'
import { Root } from './lib/Root'
import { useRootContext } from './lib/RootContext'
import { createAnimationFrame } from './utils/createAnimationFrame'
import { createEffect, createSignal, onCleanup } from 'solid-js'
import {
  ColorGradingUniforms,
  createColorGradingPipeline,
} from './flame/colorGrading'
import { createInitPointsPipeline } from './flame/initPoints'
import { WheelZoomCamera2D } from './lib/WheelZoomCamera2D'
import { useCamera } from './lib/CameraContext'
import { ComputeUniforms, createIFSPipeline } from './flame/ifsPipeline'
import { Point, outputTextureFormat } from './flame/types'
import { createRenderPointsPipeline } from './flame/renderPoints'

const MAX_POINT_COUNT = 1e6
const MAX_OUTER_ITERS = 15
const MAX_INNER_ITERS = 15

type Flam3Props = {
  outerIters: number
  skipIters: number
  pointCount: number
}

function Flam3(props: Flam3Props) {
  const camera = useCamera()
  const { root, device } = useRootContext()
  const { context, canvasSize } = useCanvas()

  const points = root
    .createBuffer(d.arrayOf(Point, MAX_POINT_COUNT))
    .$usage('storage')

  onCleanup(() => {
    points.destroy()
  })

  createEffect(() => {
    console.log('Creating everything from scratch.')
    const { width, height } = canvasSize()
    if (width * height === 0) {
      return
    }

    const outputTexture = root['~unstable']
      .createTexture({
        format: outputTextureFormat,
        size: [width, height],
      })
      .$usage('sampled', 'render')
      .$name('outputTexture')
    onCleanup(() => outputTexture.destroy())

    const outputTextureView = root.unwrap(outputTexture).createView()

    const computeUniforms = root
      .createBuffer(ComputeUniforms, { seed: 0 })
      .$usage('uniform')

    const runInitPoints = createInitPointsPipeline(
      root,
      points,
      computeUniforms,
    )
    const runSkipIfs = createIFSPipeline(
      root,
      1,
      props.skipIters,
      points,
      computeUniforms,
    )
    const runIfs = createIFSPipeline(
      root,
      MAX_OUTER_ITERS,
      1,
      points,
      computeUniforms,
    )
    const colorGradingUniforms = root
      .createBuffer(ColorGradingUniforms, {
        accumulatedIterationCount: 0,
        zoom: 1,
      })
      .$usage('uniform')

    const renderPoints = createRenderPointsPipeline(root, camera, points)
    const runColorGradingPipeline = createColorGradingPipeline(
      root,
      colorGradingUniforms,
      outputTexture,
    )

    let count = 0
    createEffect(() => {
      count = 0
      props.outerIters
      colorGradingUniforms.write({
        accumulatedIterationCount: 0,
        zoom: camera.zoom(),
      })
      const encoder = device.createCommandEncoder()
      {
        const pass = encoder.beginRenderPass({
          colorAttachments: [
            {
              view: outputTextureView,
              loadOp: 'clear',
              storeOp: 'store',
              clearValue: [0, 0, 0, 0],
            },
          ],
        })
        pass.end()
      }
      device.queue.submit([encoder.finish()])
    })

    createAnimationFrame(() => {
      camera.update()
      computeUniforms.write({ seed: Math.random() * 0xffff })
      count += 1
      colorGradingUniforms.write({
        accumulatedIterationCount: count,
        zoom: camera.zoom(),
      })
      // Encode commands to do the computation
      const encoder = device.createCommandEncoder()
      {
        const pass = encoder.beginComputePass()
        runInitPoints(pass, props.pointCount)
        runSkipIfs(0, pass, props.pointCount)
        pass.end()
      }
      {
        const pass = encoder.beginRenderPass({
          colorAttachments: [
            {
              view: outputTextureView,
              loadOp: 'load',
              storeOp: 'store',
            },
          ],
        })
        renderPoints(pass, props.pointCount)
        pass.end()
      }
      for (let i = 0; i < props.outerIters; ++i) {
        {
          const pass = encoder.beginComputePass()
          runIfs(i, pass, props.pointCount)
          pass.end()
        }
        {
          const pass = encoder.beginRenderPass({
            colorAttachments: [
              {
                view: outputTextureView,
                loadOp: 'load',
                storeOp: 'store',
              },
            ],
          })
          renderPoints(pass, props.pointCount)
          pass.end()
        }
      }

      runColorGradingPipeline(encoder, context)

      device.queue.submit([encoder.finish()])
    })
  })
  return null
}

export function App() {
  const [pixelRatio, setPixelRatio] = createSignal(1)
  const [outerIters, setOuterIters] = createSignal(3)
  const [skipIters, setSkipIters] = createSignal(5)
  const [pointCount, setPointCount] = createSignal(MAX_POINT_COUNT / 2)
  return (
    <div class={ui.fullscreen}>
      <div class={ui.overlay}>
        <label>
          Resolution
          <input
            type="range"
            min={0.125}
            max={1}
            step={0.125}
            value={pixelRatio()}
            oninput={(ev) => setPixelRatio(ev.target.valueAsNumber)}
          />
          {pixelRatio()}
        </label>
        <label>
          Outer Iterations
          <input
            type="range"
            min={0}
            max={MAX_OUTER_ITERS}
            step={1}
            value={outerIters()}
            oninput={(ev) => setOuterIters(ev.target.valueAsNumber)}
          />
          {outerIters()}
        </label>
        <label>
          Skip Iterations
          <input
            type="range"
            min={0}
            max={MAX_INNER_ITERS}
            step={1}
            value={skipIters()}
            oninput={(ev) => setSkipIters(ev.target.valueAsNumber)}
          />
          {skipIters()}
        </label>
        <label>
          Point Count
          <input
            type="range"
            min={0}
            max={MAX_POINT_COUNT}
            step={1e4}
            value={pointCount()}
            oninput={(ev) => setPointCount(ev.target.valueAsNumber)}
          />
          {(pointCount() / 1000).toFixed(0)} K
        </label>
      </div>
      <Root adapterOptions={{ powerPreference: 'high-performance' }}>
        <AutoCanvas class={ui.canvas} pixelRatio={pixelRatio()}>
          <WheelZoomCamera2D>
            <Flam3
              outerIters={outerIters()}
              skipIters={skipIters()}
              pointCount={pointCount()}
            />
          </WheelZoomCamera2D>
        </AutoCanvas>
      </Root>
    </div>
  )
}
