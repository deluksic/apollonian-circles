import ui from './App.module.css'
import * as d from 'typegpu/data'
import { AutoCanvas } from './lib/AutoCanvas'
import { useCanvas } from './lib/CanvasContext'
import { Root } from './lib/Root'
import { useRootContext } from './lib/RootContext'
import { createAnimationFrame } from './utils/createAnimationFrame'
import { createEffect, onCleanup } from 'solid-js'
import { createColorGradingPipeline } from './flame/colorGrading'
import { createInitPointsPipeline } from './flame/initPoints'
import { WheelZoomCamera2D } from './lib/WheelZoomCamera2D'
import { useCamera } from './lib/CameraContext'
import { ComputeUniforms, createIFSPipeline } from './flame/ifsPipeline'
import { Point } from './flame/types'
import { createRenderPointsPipeline } from './flame/renderPoints'

const POINT_COUNT = 6e5

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
        format: 'rgba16float',
        size: [width, height],
      })
      .$usage('sampled', 'render')
    onCleanup(() => outputTexture.destroy())

    const outputTextureView = root.unwrap(outputTexture.createView('sampled'))

    const computeUniforms = root
      .createBuffer(ComputeUniforms, { seed: 0 })
      .$usage('uniform')

    const runInitPoints = createInitPointsPipeline(
      root,
      points,
      computeUniforms,
    )
    const runSkipIfs = createIFSPipeline(root, 1, 1, points, computeUniforms)
    const runIfs = createIFSPipeline(root, 10, 1, points, computeUniforms)
    const renderPoints = createRenderPointsPipeline(root, camera, points)
    const runColorGradingPipeline = createColorGradingPipeline(
      root,
      outputTexture,
    )

    createAnimationFrame(() => {
      camera.update()
      computeUniforms.write({ seed: Math.random() * 0xffff })
      // Encode commands to do the computation
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
      {
        const pass = encoder.beginComputePass()
        runInitPoints(pass, POINT_COUNT)
        runSkipIfs(0, pass, POINT_COUNT)
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
        renderPoints(pass, POINT_COUNT)
        pass.end()
      }
      for (let i = 0; i < 10; ++i) {
        {
          const pass = encoder.beginComputePass()
          runIfs(i, pass, POINT_COUNT)
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
          renderPoints(pass, POINT_COUNT)
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
  return (
    <div class={ui.fullscreen}>
      <Root adapterOptions={{ powerPreference: 'high-performance' }}>
        <AutoCanvas class={ui.canvas} pixelRatio={0.5}>
          <WheelZoomCamera2D>
            <Flam3 />
          </WheelZoomCamera2D>
        </AutoCanvas>
      </Root>
    </div>
  )
}
