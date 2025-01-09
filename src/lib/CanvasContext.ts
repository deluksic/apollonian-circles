import { createContext } from 'solid-js'
import { useContextSafe } from '@/utils/useContextSafe'

const CanvasContext = createContext<{
  canvas: HTMLCanvasElement
  canvasSize: () => { width: number; height: number }
  context: GPUCanvasContext
}>()

export const CanvasContextProvider = CanvasContext.Provider

export function useCanvas() {
  return useContextSafe(CanvasContext, 'useCanvas', 'CanvasContext')
}
