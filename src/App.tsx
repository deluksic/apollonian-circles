import ui from './App.module.css'
import * as d from 'typegpu/data'
import { AutoCanvas } from './lib/AutoCanvas'
import { useCanvas } from './lib/CanvasContext'
import { Root } from './lib/Root'
import { useRootContext } from './lib/RootContext'
import { createAnimationFrame } from './utils/createAnimationFrame'
import { createEffect, onCleanup } from 'solid-js'
import { createClearTexturePipeline } from './flame/clearTexture'
import { createColorGradingPipeline } from './flame/colorGrading'
import { createInitPointsPipeline } from './flame/initPoints'
import { WheelZoomCamera2D } from './lib/WheelZoomCamera2D'
import { useCamera } from './lib/CameraContext'
import { ComputeUniforms, createIFSPipeline } from './flame/ifsPipeline'
import { Point } from './flame/types'

const POINT_COUNT = 1e6

function Flam3() {
  const camera = useCamera()
  const { root, device } = useRootContext()
  const { context, canvasSize } = useCanvas()

  createEffect(() => {
    const { width, height } = canvasSize()
    if (width * height === 0) {
      return
    }

    const points = root
      .createBuffer(d.arrayOf(Point, POINT_COUNT))
      .$usage('storage')

    onCleanup(() => {
      points.destroy()
    })

    const outputTexture = root['~unstable']
      .createTexture({
        format: 'r32uint',
        size: [width, height],
      })
      .$usage('storage')
    onCleanup(() => outputTexture.destroy())

    const computeUniforms = root
      .createBuffer(ComputeUniforms, { seed: 0 })
      .$usage('uniform')

    const runInitPoints = createInitPointsPipeline(root, points)
    const runColorGradingPipeline = createColorGradingPipeline(
      root,
      outputTexture,
    )
    const runClearTexture = createClearTexturePipeline(root, outputTexture)

    const runIfs = createIFSPipeline(
      root,
      camera,
      points,
      outputTexture,
      computeUniforms,
    )

    {
      // init points
      const encoder = device.createCommandEncoder()
      const pass = encoder.beginComputePass()
      runInitPoints(pass, POINT_COUNT)
      pass.end()
      device.queue.submit([encoder.finish()])
    }

    createAnimationFrame(() => {
      camera.update()
      computeUniforms.write({ seed: Math.random() * 0xffff })
      // Encode commands to do the computation
      const encoder = device.createCommandEncoder()
      {
        const pass = encoder.beginComputePass()
        runClearTexture(pass)
        runIfs(pass, POINT_COUNT)
        pass.end()
      }

      runColorGradingPipeline(encoder, context)

      device.queue.submit([encoder.finish()])
    })
  })
  return null
}

export function App() {
  return (
    <div class={ui.fullscreen}>
      <Root adapterOptions={{ powerPreference: 'high-performance' }}>
        <AutoCanvas class={ui.canvas} pixelRatio={1}>
          <WheelZoomCamera2D>
            <Flam3 />
          </WheelZoomCamera2D>
        </AutoCanvas>
      </Root>
    </div>
  )
}
