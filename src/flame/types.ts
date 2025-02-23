import tgpu, { TgpuBindGroup, TgpuBindGroupLayout, TgpuFn } from 'typegpu'
import { AnyWgslData, arrayOf, struct, Vec2f, vec2f } from 'typegpu/data'

export const Point = struct({
  position: vec2f,
})

export type BindGroupFor<T extends TgpuBindGroupLayout> =
  T extends TgpuBindGroupLayout<infer Entries> ? TgpuBindGroup<Entries> : never

export const bindGroupLayout = tgpu.bindGroupLayout({
  points: {
    storage: (length: number) => arrayOf(Point, length),
    access: 'mutable',
  },
  outputTexture: {
    storageTexture: 'r32uint',
    access: 'mutable',
    visibility: ['compute', 'fragment'],
  },
})

type TransformFn<TParams extends AnyWgslData = AnyWgslData> = {
  params: TParams | undefined
  wgslFn: TgpuFn<[Vec2f], Vec2f>
}
