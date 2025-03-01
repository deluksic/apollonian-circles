import { vec3f } from 'typegpu/data'

export function hexToRgbNorm(hex: string) {
  var bigint = parseInt(hex.replaceAll('#', ''), 16)
  var r = (bigint >> 16) & 255
  var g = (bigint >> 8) & 255
  var b = bigint & 255
  return vec3f(r / 255, g / 255, b / 255)
}
