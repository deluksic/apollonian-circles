import { createEffect, createSignal, ParentProps, Show } from 'solid-js'
import { ElementSize, useElementSize } from '@/utils/useElementSize'
import { CanvasContextProvider } from './CanvasContext'
import { useRootContext } from './RootContext'

const { min, max } = Math

type AutoCanvasProps = {
  class?: string
  pixelRatio?: number
}

export function AutoCanvas(props: ParentProps<AutoCanvasProps>) {
  const { device } = useRootContext()

  const scaledCanvasSize = (size: ElementSize): ElementSize => {
    const pixelRatio = props.pixelRatio ?? 1
    const maxDim = device.limits.maxTextureDimension2D
    return {
      ...size,
      widthPX: max(1, min(size.widthPX * pixelRatio, maxDim)),
      heightPX: max(1, min(size.heightPX * pixelRatio, maxDim)),
    }
  }

  const [canvas, setCanvas] = createSignal<HTMLCanvasElement>()
  const canvasSize = useElementSize(canvas, (size) => {
    const el = canvas()
    if (!el) {
      return
    }
    const { widthPX, heightPX } = scaledCanvasSize(size)
    el.width = widthPX
    el.height = heightPX
  })

  // also update canvas size when props.pixelRatio changes
  createEffect(() => {
    const el = canvas()
    const size = canvasSize()
    if (!el || !size) {
      return
    }
    const { widthPX, heightPX } = scaledCanvasSize(size)
    el.width = widthPX
    el.height = heightPX
  })

  function createContext(canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext('webgpu')
    if (!ctx) {
      throw new Error(`GPUCanvasContext failed to initialize.`)
    }
    ctx.configure({
      device,
      format: navigator.gpu.getPreferredCanvasFormat(),
    })
    return ctx
  }

  return (
    <>
      <canvas
        ref={setCanvas}
        class={props.class}
        style={{ width: '100%', height: '100%' }}
      />
      <Show when={canvas()} keyed>
        {(canvas) => (
          <CanvasContextProvider
            value={{
              canvas,
              context: createContext(canvas),
              canvasSize: () => {
                const size = canvasSize()
                if (!size) {
                  return { width: 0, height: 0 }
                }
                const { widthPX, heightPX } = scaledCanvasSize(size)
                return {
                  width: widthPX,
                  height: heightPX,
                }
              },
            }}
          >
            {props.children}
          </CanvasContextProvider>
        )}
      </Show>
    </>
  )
}
