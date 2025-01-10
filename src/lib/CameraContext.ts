import { Accessor, createContext } from 'solid-js'
import { useContextSafe } from '@/utils/useContextSafe'
import {
  TgpuBindGroup,
  TgpuBindGroupLayout,
  TgpuFn,
} from 'typegpu/experimental'
import { v2f, Vec2f } from 'typegpu/data'

const CameraContext = createContext<{
  update: () => void
  bindGroup: TgpuBindGroup
  BindGroupLayout: TgpuBindGroupLayout
  wgsl: {
    worldToClip: TgpuFn<[Vec2f], Vec2f>
    clipToWorld: TgpuFn<[Vec2f], Vec2f>
    clipToPixels: TgpuFn<[Vec2f], Vec2f>
  }
  js: {
    clipToWorld: (clip: v2f) => v2f
  }
  zoom: Accessor<number>
}>()

export const CameraContextProvider = CameraContext.Provider

export function useCamera() {
  return useContextSafe(CameraContext, 'useCamera', 'CameraContext')
}
