import { createContext } from 'solid-js'
import { useContextSafe } from '@/utils/useContextSafe'
import {
  TgpuBindGroup,
  TgpuBindGroupLayout,
  TgpuFn,
} from 'typegpu/experimental'
import { Vec2f } from 'typegpu/data'

const CameraContext = createContext<{
  update: () => void
  bindGroup: TgpuBindGroup
  BindGroupLayout: TgpuBindGroupLayout
  worldToClip: TgpuFn<[Vec2f], Vec2f>
  clipToWorld: TgpuFn<[Vec2f], Vec2f>
  clipToPixels: TgpuFn<[Vec2f], Vec2f>
}>()

export const CameraContextProvider = CameraContext.Provider

export function useCamera() {
  return useContextSafe(CameraContext, 'useCamera', 'CameraContext')
}
