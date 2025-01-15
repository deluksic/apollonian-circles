import {
  Show,
  createEffect,
  createMemo,
  createSignal,
  onCleanup,
} from 'solid-js'
import ui from './App.module.css'
import { useCamera } from '@/lib/CameraContext'
import { eventToClip } from '@/utils/eventToClip'
import {
  chooseOrCreateCircle,
  circles,
  closestFirstCircle,
  closestSecondCircle,
  closestThirdCircle,
  colorScheme,
  debug,
  growUntilRadius,
  nextAnimationFrame,
  setColorScheme,
  setDebug,
} from './state'
import { useCanvas } from '@/lib/CanvasContext'
import { createPromiseCallbacks } from '@/utils/createPromiseCallbacks'
import { vec2 } from 'wgpu-matrix'
import { Root } from '@/lib/Root'
import { AutoCanvas } from '@/lib/AutoCanvas'
import { WheelZoomCamera2D } from './WheelZoomCamera2D'
import { Circles } from '@/demo/Circles'
import { CircleStyleType, getTheme } from './style'

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
        const circle = circles()[index]!
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

  const theme = createMemo(() => getTheme(colorScheme()))

  const styledCircles = createMemo(() => {
    // read these up front because it's slow to do it thousands of times
    const theme_ = theme()
    const first = firstCircleIndex()
    const second = secondCircleIndex()
    const third = thirdCircleIndex()
    const selected = selectedCircleIndex()

    function style(circleIndex: number): CircleStyleType {
      if (circleIndex === selected) {
        return 'selected'
      } else if (debug()) {
        switch (circleIndex) {
          case first:
            return 'debugFirst'
          case second:
            return 'debugSecond'
          case third:
            return 'debugThird'
        }
      }
      return 'normal'
    }

    return circles().map((c, i) => ({
      center: c.center,
      radius: c.radius,
      styleIndex: theme_.getStyleIndex(style(i)),
    }))
  })

  return (
    <Circles
      circles={styledCircles()}
      clearColor={colorScheme() === 'light' ? [1, 1, 1, 1] : [0, 0, 0, 1]}
      styles={theme().styles}
    />
  )
}

export function App() {
  return (
    <div class={ui.page} classList={{ [ui[colorScheme()]]: true }}>
      <div class={ui.circleCounter}>Number of Circles: {circles().length}</div>
      <div class={ui.controls}>
        <label>
          <input
            type="checkbox"
            checked={colorScheme() === 'dark'}
            onChange={(ev) =>
              setColorScheme(ev.target.checked ? 'dark' : 'light')
            }
          />{' '}
          Dark
        </label>
        <label>
          <input
            type="checkbox"
            checked={debug()}
            onChange={(ev) => setDebug(ev.target.checked)}
          />{' '}
          Debug mode
        </label>
      </div>
      <Show when={circles().length === 0}>
        <div class={ui.welcomeMessage}>
          <h1>Apollonian Circles</h1>
          <p class={ui.welcomeMessageSubtitle}>
            Click to create, scroll to zoom.
          </p>
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
