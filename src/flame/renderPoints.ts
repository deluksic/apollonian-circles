import { CameraContext } from '@/lib/CameraContext'
import { hash } from '@/shaders/random'
import { wgsl } from '@/utils/wgsl'
import tgpu, { StorageFlag, TgpuBuffer, TgpuRoot } from 'typegpu'
import { arrayOf, WgslArray } from 'typegpu/data'
import { Point } from './types'

const bindGroupLayout = tgpu.bindGroupLayout({
  points: {
    storage: (length: number) => arrayOf(Point, length),
  },
})

export function createRenderPointsPipeline(
  root: TgpuRoot,
  camera: CameraContext,
  points: TgpuBuffer<WgslArray<typeof Point>> & StorageFlag,
) {
  const { device } = root

  const bindGroup = root.createBindGroup(bindGroupLayout, {
    points,
  })

  const renderPointsShaderCode = wgsl/* wgsl */ `
    ${{
      ...camera.BindGroupLayout.bound,
      ...bindGroupLayout.bound,
      worldToClip: camera.wgsl.worldToClip,
      hash,
    }}

    @vertex fn vs(@builtin(vertex_index) vertex_index: u32) -> @builtin(position) vec4f {
      let position = points[vertex_index].position;
      return vec4f(worldToClip(position), 0, 1);
    }

    @fragment fn fs() -> @location(0) vec4f {
      return vec4f(0, 0, 0, 1);
    }
  `

  const module = device.createShaderModule({
    code: renderPointsShaderCode,
  })

  const renderPointsPipeline = device.createRenderPipeline({
    layout: device.createPipelineLayout({
      bindGroupLayouts: [
        root.unwrap(camera.BindGroupLayout),
        root.unwrap(bindGroupLayout),
      ],
    }),
    primitive: {
      topology: 'point-list',
    },
    vertex: {
      module,
    },
    fragment: {
      module,
      targets: [
        {
          format: 'rgba16float',
          blend: {
            color: { operation: 'add', srcFactor: 'one', dstFactor: 'one' },
            alpha: { operation: 'add', srcFactor: 'one', dstFactor: 'one' },
          },
        },
      ],
    },
  })

  return (pass: GPURenderPassEncoder, pointCount: number) => {
    pass.setPipeline(renderPointsPipeline)
    pass.setBindGroup(0, root.unwrap(camera.bindGroup))
    pass.setBindGroup(1, root.unwrap(bindGroup))
    pass.draw(pointCount)
  }
}
