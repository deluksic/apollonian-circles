import { Accessor, createSignal } from 'solid-js'
import { createStore, produce, unwrap } from 'solid-js/store'
import {
  vec2Distance,
  vec2Dot,
  vec2Length,
  vec2LengthSqr,
  vec2Normalize,
  vec2Ortho,
  vec2Scale,
  vec2ScaleAndAdd,
  vec2ScaleAndAdd2,
  vec2Sub,
} from './vec2'
import { nextAnimationFrame } from './utils'

export const [circles, setCircles] = createStore<Circle[]>([])
export const [debug, setDebug] = createSignal(false)

const { sign, sqrt, abs, min, max } = Math

export function chooseOrCreateCircle(xy: Vec2): number {
  const circles_ = unwrap(circles)
  const index = circles_.findIndex((c) => vec2Distance(c.center, xy) < c.radius)
  if (index === -1) {
    setCircles(
      produce((circles) => {
        circles.push({ center: xy, radius: 0 })
      })
    )
    return circles.length - 1
  }
  return index
}

export function closestFirstCircle(queryCircleIndex: number) {
  const circles_ = unwrap(circles)
  let radius = Number.POSITIVE_INFINITY
  let index = undefined
  const { center } = circles_[queryCircleIndex]!
  for (let i = 0; i < circles_.length; ++i) {
    if (i === queryCircleIndex) continue
    const c = circles_[i]!
    const dist = vec2Distance(c.center, center) - c.radius
    if (dist < radius) {
      radius = dist
      index = i
    }
  }
  const curve = () => center
  return { index, radius, curve }
}

function twoCircleTouchingRadius(c1: Circle, c2: Circle, d: Vec2): number {
  const p = vec2Sub(c2.center, c1.center)
  const r = c2.radius - c1.radius
  const p2 = vec2Dot(p, p)
  const dp = vec2Dot(d, p)
  return (p2 - r * r) / (2 * (dp + r * vec2Length(d))) - c1.radius
}

export function closestSecondCircle(
  firstCircleIndex: number,
  queryCircleIndex: number
) {
  const circles_ = unwrap(circles)
  const firstCircle = circles_[firstCircleIndex]!
  const queryCircle = circles_[queryCircleIndex]!
  const d = vec2Normalize(vec2Sub(queryCircle.center, firstCircle.center))
  let radius = Number.POSITIVE_INFINITY
  let index = undefined
  for (let i = 0; i < circles_.length; ++i) {
    if (i === firstCircleIndex || i === queryCircleIndex) continue
    const c = circles_[i]!
    const dist = twoCircleTouchingRadius(firstCircle, c, d)
    if (dist >= -firstCircle.radius / 2 && dist < radius) {
      radius = dist
      index = i
    }
  }
  const curve = (radius: number) =>
    vec2ScaleAndAdd(firstCircle.center, d, firstCircle.radius + radius)
  return { index, radius, curve }
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

export function twoCircleCenterline(
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

export function closestThirdCircle(
  firstCircleIndex: number,
  secondCircleIndex: number,
  queryCircleIndex: number
) {
  const circles_ = unwrap(circles)
  const queryCircle = circles_[queryCircleIndex]!
  const firstCircle = circles_[firstCircleIndex]!
  const secondCircle = circles_[secondCircleIndex]!
  let radius = Number.POSITIVE_INFINITY
  let index: number | undefined = undefined
  for (let i = 0; i < circles.length; ++i) {
    if (
      i === queryCircleIndex ||
      i === firstCircleIndex ||
      i === secondCircleIndex
    ) {
      continue
    }
    const c = circles_[i]!
    const touchingRadius = threeCircleTouchingRadius(
      firstCircle,
      secondCircle,
      c,
      queryCircle
    )
    if (touchingRadius !== undefined && touchingRadius < radius) {
      radius = max(touchingRadius, queryCircle.radius)
      index = i
    }
  }
  const curve = (radius: number) =>
    twoCircleCenterline(firstCircle, secondCircle, radius, queryCircle)
  return { index, radius, curve }
}

export async function growUntilRadius(
  index: number,
  maxRadius: number,
  curve: (radius: number) => Vec2 | undefined,
  zoom: Accessor<number>,
  stop: Promise<PointerEvent>
) {
  const circle = circles[index]!
  while (true) {
    const result = await Promise.race([nextAnimationFrame(), stop])
    if (result instanceof PointerEvent) {
      return
    }
    const nextRadius = min(maxRadius, circle.radius * 1.05 + 0.005 / zoom())
    const nextCenter = curve(nextRadius)
    if (!nextCenter) {
      return
    }
    setCircles(
      index,
      produce((circle) => {
        circle.radius = nextRadius
        circle.center = nextCenter
      })
    )
    if (nextRadius === maxRadius) {
      return
    }
  }
}
