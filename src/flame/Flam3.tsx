import { onCleanup, createEffect, createMemo } from 'solid-js'
import {
  ColorGradingUniforms,
  createColorGradingPipeline,
} from './colorGrading'
import { ComputeUniforms, createIFSPipeline } from './ifsPipeline'
import { createInitPointsPipeline } from './initPoints'
import { createRenderPointsPipeline } from './renderPoints'
import { Point, outputTextureFormat } from './types'
import { useCamera } from '../lib/CameraContext'
import { useCanvas } from '../lib/CanvasContext'
import { useRootContext } from '../lib/RootContext'
import { createAnimationFrame } from '../utils/createAnimationFrame'
import { arrayOf, v3f } from 'typegpu/data'
import { DrawModeFn } from './drawMode'

export const MAX_POINT_COUNT = 1e6
export const MAX_OUTER_ITERS = 15
export const MAX_INNER_ITERS = 15

type Flam3Props = {
  outerIters: number
  skipIters: number
  pointCount: number
  drawMode: DrawModeFn
  backgroundColor: v3f
  exposure: number
  maxChroma: number
}

export function Flam3(props: Flam3Props) {
  const camera = useCamera()
  const { root, device } = useRootContext()
  const { context, canvasSize, pixelRatio } = useCanvas()

  const factor = createMemo(
    () => (camera.zoom() * pixelRatio()) ** 2 / (props.pointCount / 1e5),
  )

  const points = root
    .createBuffer(arrayOf(Point, MAX_POINT_COUNT))
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
        factor: 1,
        exposure: 1,
        maxChroma: 0.2,
      })
      .$usage('uniform')

    const renderPoints = createRenderPointsPipeline(root, camera, points)
    const runColorGradingPipeline = createColorGradingPipeline(
      root,
      colorGradingUniforms,
      outputTexture,
      context.getConfiguration()?.format ??
        navigator.gpu.getPreferredCanvasFormat(),
      props.drawMode,
    )

    let count = 0
    createEffect(() => {
      count = 0
      props.outerIters
      colorGradingUniforms.write({
        accumulatedIterationCount: 0,
        factor: factor(),
        exposure: 1,
        maxChroma: 0.2,
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
      count += props.outerIters
      colorGradingUniforms.write({
        accumulatedIterationCount: count,
        factor: factor(),
        exposure: 8 * Math.exp(props.exposure),
        maxChroma: props.maxChroma,
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

      runColorGradingPipeline(encoder, context, props.backgroundColor)

      device.queue.submit([encoder.finish()])
    })
  })
  return null
}
