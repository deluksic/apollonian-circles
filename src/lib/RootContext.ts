import { createContext } from 'solid-js'
import { useContextSafe } from '@/utils/useContextSafe'
import { TgpuRoot } from 'typegpu/experimental'

const RootContext = createContext<{
  adapter: GPUAdapter
  device: GPUDevice
  root: TgpuRoot
}>()

export const RootContextProvider = RootContext.Provider

export function useRootContext() {
  return useContextSafe(RootContext, 'useRootContext', 'RootContext')
}
