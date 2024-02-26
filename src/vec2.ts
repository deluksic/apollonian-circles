const { sqrt } = Math

export function vec2Dot([ax, ay]: Vec2, [bx, by]: Vec2) {
  return ax * bx + ay * by
}

export function vec2Distance([ax, ay]: Vec2, [bx, by]: Vec2) {
  const dx = ax - bx
  const dy = ay - by
  return sqrt(dx * dx + dy * dy)
}

export function vec2Normalize([x, y]: Vec2): Vec2 {
  const l = sqrt(x * x + y * y)
  return [x / l, y / l]
}

export function vec2Length([x, y]: Vec2) {
  return sqrt(x * x + y * y)
}

export function vec2LengthSqr([x, y]: Vec2) {
  return x * x + y * y
}

export function vec2Scale([x, y]: Vec2, s: number): Vec2 {
  return [x * s, y * s]
}

export function vec2Sub([ax, ay]: Vec2, [bx, by]: Vec2): Vec2 {
  return [ax - bx, ay - by]
}

/**
 * Rotates vector 90 degrees CCW.
 */
export function vec2Ortho([x, y]: Vec2): Vec2 {
  return [-y, x]
}

export function vec2ScaleAndAdd(
  [ax, ay]: Vec2,
  [bx, by]: Vec2,
  bs: number
): Vec2 {
  return [ax + bx * bs, ay + by * bs]
}

export function vec2ScaleAndAdd2(
  [ax, ay]: Vec2,
  [bx, by]: Vec2,
  bs: number,
  [cx, cy]: Vec2,
  cs: number
): Vec2 {
  return [ax + bx * bs + cx * cs, ay + by * bs + cy * cs]
}
