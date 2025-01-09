import { createContext } from 'solid-js'
import { useContextSafe } from '@/utils/useContextSafe'

const CanvasContext = createContext<{
  canvas: HTMLCanvasElement
  context: GPUCanvasContext
}>()

export const CanvasContextProvider = CanvasContext.Provider

export function useCanvas() {
  return useContextSafe(CanvasContext, 'useCanvas', 'CanvasContext')
}
