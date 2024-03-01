import { For, Show, createSignal } from 'solid-js'
import {
  createPromiseCallbacks,
  isDefined,
  lerp,
  nextAnimationFrame,
  range,
} from './utils'
import ui from './Circles.module.css'
import { createElementSize } from './createElementSize'
import { createCamera2D } from './camera2D'
import {
  chooseOrCreateCircle,
  circles,
  closestFirstCircle,
  closestSecondCircle,
  closestThirdCircle,
  debug,
  growUntilRadius,
  setDebug,
  twoCircleCenterline,
} from './state'
import { vec2Distance } from './vec2'

export function Circles() {
  const [element, setElement] = createSignal<HTMLElement>()
  const [selectedCircleIndex, setSelectedCircleIndex] = createSignal<number>()
  const [firstCircleIndex, setFirstCircleIndex] = createSignal<number>()
  const [secondCircleIndex, setSecondCircleIndex] = createSignal<number>()
  const [thirdCircleIndex, setThirdCircleIndex] = createSignal<number>()
  const size = createElementSize(element)
  const camera = createCamera2D(size)

  async function startCircle(ev: PointerEvent, stop: Promise<PointerEvent>) {
    while (true) {
      const xy = camera.clientToWorld(ev)
      const index = chooseOrCreateCircle(xy)

      setSelectedCircleIndex(index)
      setFirstCircleIndex(undefined)
      setSecondCircleIndex(undefined)
      setThirdCircleIndex(undefined)

      const first = closestFirstCircle(index)
      await growUntilRadius(index, first.radius, first.curve, camera.zoom, stop)
      if (first.index === undefined) {
        return
      }
      setFirstCircleIndex(first.index)

      const second = closestSecondCircle(first.index, index)
      await growUntilRadius(
        index,
        second.radius,
        second.curve,
        camera.zoom,
        stop
      )
      if (second.index === undefined) {
        return
      }
      setSecondCircleIndex(second.index)

      const third = closestThirdCircle(first.index, second.index, index)
      await growUntilRadius(index, third.radius, third.curve, camera.zoom, stop)
      if (third.index === undefined) {
        return
      }
      setThirdCircleIndex(third.index)

      {
        const circle = circles[index]!
        if (vec2Distance(circle.center, xy) < circle.radius) {
          return
        }
      }

      const result = await Promise.race([nextAnimationFrame(), stop])
      if (result instanceof PointerEvent) {
        return
      }
    }
  }

  return (
    <>
      <div class={ui.circleCounter}>Number of Circles: {circles.length}</div>
      <div class={ui.controls}>
        <label>
          <input
            type="checkbox"
            checked={debug()}
            onChange={(ev) => setDebug(ev.target.checked)}
          />{' '}
          Debug mode
        </label>
      </div>
      <Show when={circles.length === 0}>
        <div class={ui.welcomeMessage}>
          <h1>Apollonian Circles</h1>
          <span>Click to create, scroll to zoom.</span>
        </div>
      </Show>
      <svg
        ref={setElement}
        class={ui.svg}
        viewBox="-1 -1 2 2"
        preserveAspectRatio="xMidYMid meet"
        onWheel={(ev) => {
          camera.zoomKeepPointInPlace(
            1 - ev.deltaY * 0.001,
            camera.clientToWorld(ev)
          )
          ev.preventDefault()
        }}
        onPointerDown={async (ev) => {
          const { currentTarget: el } = ev
          el.setPointerCapture(ev.pointerId)
          const { promise, resolve } = createPromiseCallbacks<PointerEvent>()
          el.addEventListener('pointerup', resolve)
          promise.finally(() => {
            el.removeEventListener('pointerup', resolve)
          })
          startCircle(ev, promise)
        }}
      >
        <defs>
          <radialGradient id="CircleGradientBlack">
            <stop offset="80%" stop-color="#0000" />
            <stop offset="100%" stop-color="#000" />
          </radialGradient>
          <radialGradient id="CircleGradientRed">
            <stop offset="80%" stop-color="#F000" />
            <stop offset="100%" stop-color="#F00" />
          </radialGradient>
          <radialGradient id="CircleGradientGreen">
            <stop offset="80%" stop-color="#0F00" />
            <stop offset="100%" stop-color="#0F0" />
          </radialGradient>
          <radialGradient id="CircleGradientBlue">
            <stop offset="80%" stop-color="#00F0" />
            <stop offset="100%" stop-color="#00F" />
          </radialGradient>
        </defs>
        <g transform={camera.transform()}>
          <For each={circles}>
            {(circle, i) => (
              <circle
                cx={circle.center[0]}
                cy={circle.center[1]}
                r={circle.radius}
                fill={
                  debug()
                    ? i() === firstCircleIndex()
                      ? 'url(#CircleGradientRed'
                      : i() === secondCircleIndex()
                      ? 'url(#CircleGradientGreen'
                      : i() === thirdCircleIndex()
                      ? 'url(#CircleGradientBlue'
                      : 'url(#CircleGradientBlack'
                    : 'url(#CircleGradientBlack'
                }
              />
            )}
          </For>
          <Show
            when={
              debug() &&
              selectedCircleIndex() !== undefined &&
              firstCircleIndex() !== undefined &&
              secondCircleIndex() !== undefined
            }
          >
            {(() => {
              const d = () => {
                const selectedCircle = circles[selectedCircleIndex()!]!
                const firstCircle = circles[firstCircleIndex()!]!
                const secondCircle = circles[secondCircleIndex()!]!
                const pathString = range(1000)
                  .map((i) =>
                    twoCircleCenterline(
                      firstCircle,
                      secondCircle,
                      lerp(0, 0.4 / camera.zoom(), i / 1000),
                      selectedCircle
                    )
                  )
                  .filter(isDefined)
                  .map(([x, y]) => `${x} ${y}`)
                  .join(` L `)
                return `M ${pathString}`
              }
              return (
                <path
                  fill="none"
                  stroke="black"
                  vector-effect="non-scaling-stroke"
                  stroke-width={1}
                  d={d()}
                />
              )
            })()}
          </Show>
        </g>
      </svg>
    </>
  )
}
