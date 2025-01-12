import { vec4f } from 'typegpu/data'
import { CircleStyle } from './Circles'
import { enumerate } from '@/utils/enumerate'

export type CircleStyleType =
  | 'normal'
  | 'selected'
  | 'debugFirst'
  | 'debugSecond'
  | 'debugThird'

type CircleStyles = Record<CircleStyleType, CircleStyle>

const light: CircleStyles = {
  normal: {
    rimColor: vec4f(0, 0, 0, 1),
    fadeColor: vec4f(0, 0, 0, 1),
  },
  selected: {
    rimColor: vec4f(0, 0, 0, 1),
    fadeColor: vec4f(0.5, 0.8, 1, 1),
  },
  debugFirst: {
    rimColor: vec4f(0, 0, 0, 1),
    fadeColor: vec4f(1, 0, 0, 1),
  },
  debugSecond: {
    rimColor: vec4f(0, 0, 0, 1),
    fadeColor: vec4f(0, 1, 0, 1),
  },
  debugThird: {
    rimColor: vec4f(0, 0, 0, 1),
    fadeColor: vec4f(0, 0, 1, 1),
  },
}

const dark: CircleStyles = {
  normal: {
    rimColor: vec4f(1, 1, 1, 1),
    fadeColor: vec4f(1, 1, 1, 1),
  },
  selected: {
    rimColor: vec4f(1, 1, 1, 1),
    fadeColor: vec4f(0.1, 0.3, 0.8, 1),
  },
  debugFirst: {
    rimColor: vec4f(1, 1, 1, 1),
    fadeColor: vec4f(1, 0, 0, 1),
  },
  debugSecond: {
    rimColor: vec4f(1, 1, 1, 1),
    fadeColor: vec4f(0, 1, 0, 1),
  },
  debugThird: {
    rimColor: vec4f(1, 1, 1, 1),
    fadeColor: vec4f(0, 0, 1, 1),
  },
}

const themes = {
  light,
  dark,
}

export function getTheme(themeKey: keyof typeof themes) {
  const theme = themes[themeKey]
  const styleKeyToIndexMap = Object.fromEntries(
    enumerate(Object.keys(theme)).map(([i, key]) => [key, i]),
  ) as Record<CircleStyleType, number>
  return {
    styles: Object.values(theme),
    getStyleIndex(styleKey: CircleStyleType) {
      return styleKeyToIndexMap[styleKey]
    },
  }
}
