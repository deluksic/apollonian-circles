import { createSignal, createEffect, onCleanup } from 'solid-js'
import type { Accessor } from 'solid-js'

export function createElementSize(element: Accessor<HTMLElement | undefined>) {
  const [size, setSize] = createSignal<{ width: number; height: number }>()
  createEffect(() => {
    const el = element()
    if (!el) {
      return
    }
    const obs = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const s = entry.devicePixelContentBoxSize[0]
        if (s) {
          setSize({
            width: s.inlineSize,
            height: s.blockSize,
          })
        }
      }
    })
    obs.observe(el)
    onCleanup(() => {
      obs.unobserve(el)
    })
  })
  return size
}
