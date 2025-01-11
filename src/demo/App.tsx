import { Show, createEffect, createSignal, onCleanup } from 'solid-js'
import ui from './App.module.css'
import { useCamera } from '@/lib/CameraContext'
import { eventToClip } from '@/utils/eventToClip'
import {
  chooseOrCreateCircle,
  circles,
  closestFirstCircle,
  closestSecondCircle,
  closestThirdCircle,
  growUntilRadius,
  nextAnimationFrame,
} from './state'
import { useCanvas } from '@/lib/CanvasContext'
import { createPromiseCallbacks } from '@/utils/createPromiseCallbacks'
import { vec2 } from 'wgpu-matrix'
import { Root } from '@/lib/Root'
import { AutoCanvas } from '@/lib/AutoCanvas'
import { WheelZoomCamera2D } from './WheelZoomCamera2D'
import { Circles } from '@/demo/Circles'
import { vec4f } from 'typegpu/data'

function Inside() {
  const {
    js: { clipToWorld },
    zoom,
  } = useCamera()
  const [selectedCircleIndex, setSelectedCircleIndex] = createSignal<number>()
  const [firstCircleIndex, setFirstCircleIndex] = createSignal<number>()
  const [secondCircleIndex, setSecondCircleIndex] = createSignal<number>()
  const [thirdCircleIndex, setThirdCircleIndex] = createSignal<number>()

  async function startCircle(ev: PointerEvent, stop: Promise<PointerEvent>) {
    while (true) {
      const clip = eventToClip(ev)
      const world = clipToWorld(clip)
      const index = chooseOrCreateCircle(world)

      setSelectedCircleIndex(index)
      setFirstCircleIndex(undefined)
      setSecondCircleIndex(undefined)
      setThirdCircleIndex(undefined)

      const first = closestFirstCircle(index)
      await growUntilRadius(index, first.radius, first.curve, zoom, stop)
      if (first.index === undefined) {
        return
      }
      setFirstCircleIndex(first.index)

      const second = closestSecondCircle(first.index, index)
      await growUntilRadius(index, second.radius, second.curve, zoom, stop)
      if (second.index === undefined) {
        return
      }
      setSecondCircleIndex(second.index)

      const third = closestThirdCircle(first.index, second.index, index)
      await growUntilRadius(index, third.radius, third.curve, zoom, stop)
      if (third.index === undefined) {
        return
      }
      setThirdCircleIndex(third.index)
      setSelectedCircleIndex(undefined)

      {
        const circle = circles[index]!
        if (vec2.distance(circle.center, world) < circle.radius) {
          return
        }
      }

      const result = await Promise.race([nextAnimationFrame(), stop])
      if (result instanceof PointerEvent) {
        return
      }
    }
  }

  const { canvas } = useCanvas()

  async function onPointerDown(ev: PointerEvent) {
    const { currentTarget: el } = ev
    if (!(el instanceof HTMLElement)) {
      return
    }
    el.setPointerCapture(ev.pointerId)
    const { promise, resolve } = createPromiseCallbacks<PointerEvent>()
    el.addEventListener('pointerup', resolve)
    promise.finally(() => {
      el.removeEventListener('pointerup', resolve)
    })
    startCircle(ev, promise)
  }
  createEffect(() => {
    canvas.addEventListener('pointerdown', onPointerDown)
    onCleanup(() => {
      canvas.removeEventListener('pointerdown', onPointerDown)
    })
  })

  return (
    <Circles
      circles={circles}
      highlighted={
        selectedCircleIndex() !== undefined
          ? {
              index: selectedCircleIndex()!,
              color_: {
                rim: vec4f(0, 0, 0, 1),
                fade: vec4f(0.5, 0.8, 1, 1),
              },
            }
          : undefined
      }
    />
  )
}

export function App() {
  return (
    <div class={ui.page}>
      <div class={ui.circleCounter}>Number of Circles: {circles.length}</div>
      <Show when={circles.length === 0}>
        <div class={ui.welcomeMessage}>
          <h1>Apollonian Circles</h1>
          <span>Click to create, scroll to zoom.</span>
        </div>
      </Show>
      <Root>
        <AutoCanvas class={ui.canvas}>
          <WheelZoomCamera2D>
            <Inside />
          </WheelZoomCamera2D>
        </AutoCanvas>
      </Root>
    </div>
  )
}
