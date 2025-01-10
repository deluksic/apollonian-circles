import { vec2f } from 'typegpu/data'

export function eventToClip(ev: PointerEvent | WheelEvent) {
  if (!(ev.target instanceof HTMLElement)) {
    return vec2f()
  }
  const rect = ev.target?.getBoundingClientRect()
  const centerX = rect.x + rect.width / 2
  const centerY = rect.y + rect.height / 2
  const x = ((ev.clientX - centerX) / rect.width) * 2
  const y = ((centerY - ev.clientY) / rect.height) * 2
  return vec2f(x, y)
}
