import { For, Show, createSignal } from 'solid-js'
import { produce } from 'solid-js/store'
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
import { circles, debug, setCircles, setDebug } from './state'
import {
  vec2Sub,
  vec2Dot,
  vec2Length,
  vec2Scale,
  vec2Ortho,
  vec2ScaleAndAdd2,
  vec2Normalize,
  vec2LengthSqr,
  vec2Distance,
  vec2ScaleAndAdd,
} from './vec2'

const { sqrt, min, abs, sign } = Math

function twoCircleTouchingRadius(c1: Circle, c2: Circle, d: Vec2): number {
  const p = vec2Sub(c2.center, c1.center)
  const r = c2.radius - c1.radius
  return (
    (vec2Dot(p, p) - r * r) / (2 * (vec2Dot(d, p) + r * vec2Length(d))) -
    c1.radius
  )
}

function twoCircleTangentCircle(
  c1: Circle,
  c2: Circle,
  targetRadius: number,
  queryCircle: Circle
): Vec2 | undefined {
  if (c1.radius > c2.radius) {
    ;[c1, c2] = [c2, c1] // for better accuracy
  }
  const p = vec2Sub(c2.center, c1.center)
  const d = vec2Length(p)
  const r1 = c1.radius
  const r2 = c2.radius
  const rt = targetRadius
  const x = (r1 * r1 - r2 * r2 + 2 * (r1 - r2) * rt + d * d) / (2 * d)
  const D = (r1 + rt) ** 2 - x * x
  if (D < 0) {
    return undefined
  }
  const u = vec2Scale(p, 1 / d)
  const v = vec2Ortho(u)
  const y = sqrt(D)
  const querySide = sign(
    vec2Dot(vec2Ortho(p), vec2Sub(queryCircle.center, c1.center))
  )
  return vec2ScaleAndAdd2(c1.center, u, x, v, y * querySide)
}

function threeCircleTouchingRadius(
  c1: Circle,
  c2: Circle,
  c3: Circle,
  queryCircle: Circle
) {
  if (c1.radius < c2.radius) {
    ;[c1, c2] = [c2, c1] // for better accuracy
  }
  const r1 = c1.radius
  const r2 = c2.radius
  const r3 = c3.radius

  if (r1 === r2) {
    throw new Error(`Not Implemented when radii are the same`)
  }

  const c12 = vec2Sub(c2.center, c1.center)
  const vx = vec2Normalize(c12)
  const vy = vec2Ortho(vx)
  const c13 = vec2Sub(c3.center, c1.center)
  const cl2 = vec2LengthSqr(c13)
  const querySide = sign(vec2Dot(vy, vec2Sub(queryCircle.center, c1.center)))
  const cx = vec2Dot(vx, c13)
  const cy = vec2Dot(vy, c13) * querySide
  const d = vec2Length(c12)
  const a = d / (r1 - r2)
  const b = (r1 - r2) / 2 - (d * d) / (2 * (r1 - r2))
  const a2 = a * a
  const cy2 = cy * cy
  const cd = r3 - r1
  const cd2 = cd * cd
  const e = cl2 - cd2
  const f = cy2 - cd2
  const A = a * (2 * b * f + cd * e) + cx * (e - 2 * b * cd)
  const B = e * ((a2 - 1) * e + 4 * b * (a * cx + b + cd))
  if (B < 0 || Number.isNaN(B)) {
    return Number.POSITIVE_INFINITY
  }
  const C = 2 * (2 * a * cd * cx + cl2 - a2 * f)
  const x = (A - cy * sqrt(B)) / C
  const y = sqrt((a * x + b) ** 2 - x * x)
  const r = a * x + b - r1
  if (
    // filter out solutions on the negative hyperbola
    x < d / 2 ||
    // filter out solutions on the mirror side of the hyperbola
    abs(vec2Distance([x, y], [cx, cy]) - r3 - r) >
      abs(vec2Distance([x, -y], [cx, cy]) - r3 - r)
  ) {
    return Number.POSITIVE_INFINITY
  }
  return r
}

/**
 * (r1+t)^2 - (r2+t)^2 = (r1^2+2r1*t+t^2) - (r2^2+2r2*t+t^2) + d^2
 */

export function Circles() {
  const [element, setElement] = createSignal<HTMLElement>()
  const [selectedCircleIndex, setSelectedCircleIndex] = createSignal<number>()
  const [firstCircleIndex, setFirstCircleIndex] = createSignal<number>()
  const [secondCircleIndex, setSecondCircleIndex] = createSignal<number>()
  const [thirdCircleIndex, setThirdCircleIndex] = createSignal<number>()
  const size = createElementSize(element)
  const camera = createCamera2D(size)

  async function startCircle(ev: PointerEvent, stop: Promise<PointerEvent>) {
    const xy = camera.clientToWorld(ev)
    let index = circles.findIndex((c) => vec2Distance(c.center, xy) < c.radius)
    if (index === -1) {
      setCircles(
        produce((circles) => {
          circles.push({ center: xy, radius: 0 })
        })
      )
      index = circles.length - 1
    }

    setSelectedCircleIndex(index)
    setFirstCircleIndex(undefined)
    setSecondCircleIndex(undefined)
    setThirdCircleIndex(undefined)

    const circle = circles[index]
    let firstCircleIndex: number | undefined = undefined
    let closestRadius = Number.POSITIVE_INFINITY
    let closestIndex = undefined
    for (let i = 0; i < circles.length; ++i) {
      if (i === index) continue
      const c = circles[i]
      const dist = vec2Distance(c.center, circle.center) - c.radius
      if (dist < closestRadius) {
        closestRadius = dist
        closestIndex = i
      }
    }
    while (firstCircleIndex === undefined) {
      const result = await Promise.race([nextAnimationFrame(), stop])
      if (result instanceof PointerEvent) {
        return
      }
      const nextRadius = circle.radius + 0.005 / camera.zoom()
      if (closestRadius < nextRadius) {
        firstCircleIndex = closestIndex
        setFirstCircleIndex(firstCircleIndex)
      }
      setCircles(
        produce((circles) => {
          circles[index].radius = min(nextRadius, closestRadius)
        })
      )
    }
    const firstCircle = circles[firstCircleIndex]!
    const d = vec2Normalize(vec2Sub(circle.center, firstCircle.center))
    let secondCircleIndex: number | undefined = undefined
    while (secondCircleIndex === undefined) {
      const result = await Promise.race([nextAnimationFrame(), stop])
      if (result instanceof PointerEvent) {
        return
      }
      const nextRadius = circle.radius + 0.005 / camera.zoom()
      let closestRadius = Number.POSITIVE_INFINITY
      let closestIndex = undefined
      for (let i = 0; i < circles.length; ++i) {
        if (i === index || i === firstCircleIndex) continue
        const c = circles[i]
        const dist = twoCircleTouchingRadius(firstCircle, c, d)
        if (dist >= 0 && dist < closestRadius) {
          closestRadius = dist
          closestIndex = i
        }
      }
      if (closestRadius < nextRadius) {
        secondCircleIndex = closestIndex
        setSecondCircleIndex(secondCircleIndex)
      }
      const actualRadius = min(closestRadius, nextRadius)
      const diff = actualRadius - circle.radius
      if (diff > 0) {
        setCircles(
          produce((circles) => {
            circles[index].center = vec2ScaleAndAdd(
              circles[index].center,
              d,
              diff
            )
            circles[index].radius = actualRadius
          })
        )
      }
    }
    const secondCircle = circles[secondCircleIndex]!
    let maxNextRadius = Number.POSITIVE_INFINITY
    let thirdCircleIndex: number | undefined = undefined
    for (let i = 0; i < circles.length; ++i) {
      if (i === index || i === firstCircleIndex || i === secondCircleIndex) {
        continue
      }
      const c = circles[i]
      const radius = threeCircleTouchingRadius(
        firstCircle,
        secondCircle,
        c,
        circle
      )
      if (
        radius !== undefined &&
        radius >= circle.radius &&
        radius < maxNextRadius
      ) {
        maxNextRadius = radius
        thirdCircleIndex = i
        setThirdCircleIndex(thirdCircleIndex)
      }
    }
    while (true) {
      const result = await Promise.race([nextAnimationFrame(), stop])
      if (result instanceof PointerEvent) {
        break
      }
      const nextRadius = min(
        maxNextRadius,
        circle.radius + 0.005 / camera.zoom()
      )
      const closestP = twoCircleTangentCircle(
        firstCircle,
        secondCircle,
        nextRadius,
        circle
      )
      if (!closestP) {
        return
      }
      setCircles(
        produce((circles) => {
          circles[index].center = closestP
          circles[index].radius = nextRadius
        })
      )
    }
  }

  return (
    <>
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
            1 + ev.deltaY * 0.001,
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
                    twoCircleTangentCircle(
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
