import { createSignal } from 'solid-js'
import type { Accessor } from 'solid-js'

export function createCamera2D(
  elementSize: Accessor<{ width: number; height: number } | undefined>
) {
  const [center, setCenter] = createSignal([0, 0])
  const [zoom, setZoom] = createSignal(1)

  const aspectRatio = () => {
    const s = elementSize()
    return s ? s.width / s.height : 1
  }

  const transform = () => {
    const [x, y] = center()
    const z = zoom()
    return `scale(${z}) translate(${-x},${-y})`
  }

  /**
   * Assumes:
   * ```tsx
   * <svg
   *   viewBox="-1 -1 2 2"
   *   preserveAspectRatio='xMidYMid meet'
   * >
   * ```
   */
  function clientToWorld({
    clientX,
    clientY,
  }: {
    clientX: number
    clientY: number
  }): Vec2 {
    const { width = 1, height = 1 } = elementSize() ?? {}
    const r = aspectRatio()
    const [x, y] = center()
    const z = 1 / zoom()
    const { devicePixelRatio } = window
    if (r > 1) {
      return [
        x + 2 * z * r * ((clientX * devicePixelRatio) / width - 0.5),
        y + 2 * z * ((clientY * devicePixelRatio) / height - 0.5),
      ]
    }
    return [
      x + 2 * z * ((clientX * devicePixelRatio) / width - 0.5),
      y + ((2 * z) / r) * ((clientY * devicePixelRatio) / height - 0.5),
    ]
  }

  function zoomKeepPointInPlace(multiplier: number, [tx, ty]: Vec2) {
    setZoom((oldZoom) => oldZoom * multiplier)
    setCenter(([x, y]) => [
      tx + (x - tx) / multiplier,
      ty + (y - ty) / multiplier,
    ])
  }

  return {
    zoom,
    zoomKeepPointInPlace,
    clientToWorld,
    transform,
  }
}
