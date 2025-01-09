import { createContext } from 'solid-js'
import { useContextSafe } from '@/utils/useContextSafe'
import {
  TgpuBindGroup,
  TgpuBindGroupLayout,
  TgpuFn,
} from 'typegpu/experimental'
import { m3x3f, Vec2f, Vec3f } from 'typegpu/data'

const CameraContext = createContext<{
  cameraBindGroup: TgpuBindGroup
  CameraBindGroupLayout: TgpuBindGroupLayout
  positionTransform: TgpuFn<[Vec2f], Vec3f>
  directionTransform: TgpuFn<[Vec2f], Vec2f>
}>()

export const CameraContextProvider = CameraContext.Provider

export function useCamera() {
  return useContextSafe(CameraContext, 'useCamera', 'CameraContext')
}
