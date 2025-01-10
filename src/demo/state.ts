import { Accessor, createSignal } from 'solid-js'
import { createStore, produce, unwrap } from 'solid-js/store'
import { vec2 } from 'wgpu-matrix'
import { v2f, vec2f } from 'typegpu/data'

type Circle = {
  center: v2f
  radius: number
}

export function nextAnimationFrame() {
  return new Promise((resolve) => requestAnimationFrame(resolve))
}

/**
 * Rotates vector 90 degrees CCW.
 */
function vec2Ortho({ x, y }: v2f): v2f {
  return vec2f(-y, x)
}

function vec2AddScaled2(a: v2f, b: v2f, bs: number, c: v2f, cs: number): v2f {
  return vec2f(a.x + b.x * bs + c.x * cs, a.y + b.y * bs + c.y * cs)
}

export const [circles, setCircles] = createStore<Circle[]>([])
export const [debug, setDebug] = createSignal(false)

const { sign, sqrt, abs, min, max } = Math

export function chooseOrCreateCircle(xy: v2f): number {
  const circles_ = unwrap(circles)
  const index = circles_.findIndex(
    (c) => vec2.distance(c.center, xy) < c.radius,
  )
  if (index === -1) {
    setCircles(
      produce((circles) => {
        circles.push({ center: xy, radius: 0 })
      }),
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
    const dist = vec2.distance(c.center, center) - c.radius
    if (dist < radius) {
      radius = dist
      index = i
    }
  }
  const curve = () => center
  return { index, radius, curve }
}

function twoCircleTouchingRadius(c1: Circle, c2: Circle, d: v2f): number {
  const p = vec2.sub(c2.center, c1.center, vec2f())
  const r = c2.radius - c1.radius
  const p2 = vec2.dot(p, p)
  const dp = vec2.dot(d, p)
  return (p2 - r * r) / (2 * (dp + r * vec2.length(d))) - c1.radius
}

export function closestSecondCircle(
  firstCircleIndex: number,
  queryCircleIndex: number,
) {
  const circles_ = unwrap(circles)
  const firstCircle = circles_[firstCircleIndex]!
  const queryCircle = circles_[queryCircleIndex]!
  const d = vec2.normalize(
    vec2.sub(queryCircle.center, firstCircle.center, vec2f()),
    vec2f(),
  )
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
  const curve = (radius: number) => {
    const res = vec2.addScaled(
      firstCircle.center,
      d,
      firstCircle.radius + radius,
      vec2f(),
    )
    return res
  }

  return { index, radius, curve }
}

function threeCircleTouchingRadius(
  c1: Circle,
  c2: Circle,
  c3: Circle,
  queryCircle: Circle,
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

  const c12 = vec2.sub(c2.center, c1.center, vec2f())
  const vx = vec2.normalize(c12, vec2f())
  const vy = vec2Ortho(vx)
  const c13 = vec2.sub(c3.center, c1.center, vec2f())
  const cl2 = vec2.lengthSq(c13)
  const querySide = sign(
    vec2.dot(vy, vec2.sub(queryCircle.center, c1.center, vec2f())),
  )
  const cx = vec2.dot(vx, c13)
  const cy = vec2.dot(vy, c13) * querySide
  const d = vec2.length(c12)
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
    abs(vec2.distance([x, y], [cx, cy]) - r3 - r) >
      abs(vec2.distance([x, -y], [cx, cy]) - r3 - r)
  ) {
    return Number.POSITIVE_INFINITY
  }
  return r
}

export function twoCircleCenterline(
  c1: Circle,
  c2: Circle,
  targetRadius: number,
  queryCircle: Circle,
): v2f | undefined {
  if (c1.radius > c2.radius) {
    ;[c1, c2] = [c2, c1] // for better accuracy
  }
  const p = vec2.sub(c2.center, c1.center, vec2f())
  const d = vec2.length(p)
  const r1 = c1.radius
  const r2 = c2.radius
  const rt = targetRadius
  const x = (r1 * r1 - r2 * r2 + 2 * (r1 - r2) * rt + d * d) / (2 * d)
  const D = (r1 + rt) ** 2 - x * x
  if (D < 0) {
    return undefined
  }
  const u = vec2.scale(p, 1 / d, vec2f())
  const v = vec2Ortho(u)
  const y = sqrt(D)
  const querySide = sign(
    vec2.dot(vec2Ortho(p), vec2.sub(queryCircle.center, c1.center, vec2f())),
  )
  return vec2AddScaled2(c1.center, u, x, v, y * querySide)
}

export function closestThirdCircle(
  firstCircleIndex: number,
  secondCircleIndex: number,
  queryCircleIndex: number,
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
      queryCircle,
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
  curve: (radius: number) => v2f | undefined,
  zoom: Accessor<number>,
  stop: Promise<PointerEvent>,
) {
  const circle = circles[index]!
  while (true) {
    const result = await Promise.race([nextAnimationFrame(), stop])
    if (result instanceof PointerEvent) {
      return
    }
    const nextRadius = min(maxRadius, circle.radius * 1.025 + 0.004 / zoom())
    const nextCenter = curve(nextRadius)
    if (!nextCenter) {
      return
    }
    setCircles(
      index,
      produce((circle) => {
        circle.radius = nextRadius
        circle.center = nextCenter
      }),
    )
    if (nextRadius === maxRadius) {
      return
    }
  }
}
