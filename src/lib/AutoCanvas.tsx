import { createEffect, createSignal, ParentProps, Show } from 'solid-js'
import { useElementSize } from '@/utils/useElementSize'
import { CanvasContextProvider } from './CanvasContext'
import { useRootContext } from './RootContext'

const { min, max } = Math

type AutoCanvasProps = {
  class: string
}

export function AutoCanvas(props: ParentProps<AutoCanvasProps>) {
  const { device } = useRootContext()
  const [canvas, setCanvas] = createSignal<HTMLCanvasElement>()
  const canvasSize = useElementSize(canvas, (size) => {
    const el = canvas()
    if (!el) {
      return
    }
    el.width = max(1, min(size.widthPX, device.limits.maxTextureDimension2D))
    el.height = max(1, min(size.heightPX, device.limits.maxTextureDimension2D))
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
              canvasSize: () => ({
                width: canvasSize()?.widthPX ?? 0,
                height: canvasSize()?.heightPX ?? 0,
              }),
            }}
          >
            {props.children}
          </CanvasContextProvider>
        )}
      </Show>
    </>
  )
}
