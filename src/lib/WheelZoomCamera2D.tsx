import { Camera2D } from '@/lib/Camera2D'
import { useCamera } from '@/lib/CameraContext'
import { useCanvas } from '@/lib/CanvasContext'
import { eventToClip } from '@/utils/eventToClip'
import {
  ParentProps,
  createSignal,
  batch,
  createEffect,
  onCleanup,
} from 'solid-js'
import { vec2f, v2f } from 'typegpu/data'

export function WheelZoomCamera2D(props: ParentProps) {
  const { canvas } = useCanvas()
  const [zoom, setZoom] = createSignal(1)
  const [position, setPosition] = createSignal(vec2f())
  let clipToWorld: (clip: v2f) => v2f | undefined

  function onWheel(ev: WheelEvent) {
    ev.preventDefault()
    const clip = eventToClip(ev)
    const world = clipToWorld?.(clip)
    if (!world) {
      return
    }
    const oldZoom = zoom()
    const newZoom = oldZoom * (1 - ev.deltaY * 0.001)
    const ratio = oldZoom / newZoom
    batch(() => {
      setPosition(({ x, y }) =>
        vec2f(x + (world.x - x) * (1 - ratio), y + (world.y - y) * (1 - ratio)),
      )
      setZoom(newZoom)
    })
  }

  createEffect(() => {
    canvas.addEventListener('wheel', onWheel, { passive: false })
    onCleanup(() => {
      canvas.removeEventListener('wheel', onWheel)
    })
  })

  return (
    <Camera2D position={position()} fovy={1 / zoom()}>
      {(() => {
        let { js } = useCamera()
        // steal clipToWorld from the camera
        clipToWorld = js.clipToWorld
        return null
      })()}
      {props.children}
    </Camera2D>
  )
}
