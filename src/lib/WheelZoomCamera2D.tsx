import { Camera2D } from '@/lib/Camera2D'
import { useCamera } from '@/lib/CameraContext'
import { useCanvas } from '@/lib/CanvasContext'
import { createDragHandler } from '@/utils/createDragHandler'
import { eventToClip } from '@/utils/eventToClip'
import {
  ParentProps,
  createSignal,
  batch,
  createEffect,
  onCleanup,
} from 'solid-js'
import { vec2f, v2f } from 'typegpu/data'
import { vec2 } from 'wgpu-matrix'

export function WheelZoomCamera2D(props: ParentProps) {
  const { canvas } = useCanvas()
  const [zoom, setZoom] = createSignal(1)
  const [position, setPosition] = createSignal(vec2f())
  let clipToWorld: (clip: v2f) => v2f | undefined

  const pan = createDragHandler((initEvent) => {
    if (!clipToWorld) {
      return
    }
    const grabPosition = clipToWorld(eventToClip(initEvent))
    if (!grabPosition) {
      return
    }
    return {
      onPointerMove(event) {
        const pos = clipToWorld(eventToClip(event))
        if (!pos) {
          return
        }
        setPosition((p) => vec2.sub(p, vec2.sub(pos, grabPosition), vec2f()))
      },
    }
  })

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
    canvas.addEventListener('pointerdown', pan)
    canvas.addEventListener('wheel', onWheel, { passive: false })
    onCleanup(() => {
      canvas.removeEventListener('pointerdown', pan)
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
