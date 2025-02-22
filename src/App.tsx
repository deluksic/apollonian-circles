import ui from './App.module.css'
import * as d from 'typegpu/data'
import { AutoCanvas } from './lib/AutoCanvas'
import { useCanvas } from './lib/CanvasContext'
import { Root } from './lib/Root'
import { useRootContext } from './lib/RootContext'
import { wgsl } from './utils/wgsl'
import tgpu from 'typegpu'
import { createAnimationFrame } from './utils/createAnimationFrame'
import { createEffect, onCleanup } from 'solid-js'

const { ceil, random } = Math

function randomBell() {
  return (random() + random() + random() + random() + random() + random()) / 6
}

const CLEAR_GROUP_SIZE = 32
const IFS_GROUP_SIZE = 32
const POINT_COUNT = 5e6

const Point = d.struct({
  position: d.vec2f,
})

const Texel = d.struct({
  count: d.u32,
  hue: d.f32,
  sat: d.f32,
})

const bindGroupLayout = tgpu.bindGroupLayout({
  points: {
    storage: (length: number) => d.arrayOf(Point, length),
    access: 'mutable',
  },
  textureBuffer: {
    storage: (length: number) => d.arrayOf(Texel, length),
    access: 'mutable',
    visibility: ['compute', 'fragment'],
  },
  textureSize: {
    uniform: d.vec2u,
    visibility: ['compute', 'fragment'],
  },
})

function Flam3() {
  const { root, device } = useRootContext()
  const { context, canvasSize } = useCanvas()

  createEffect(() => {
    const { width, height } = canvasSize()
    if (width * height === 0) {
      return
    }

    const points = root
      .createBuffer(d.arrayOf(Point, POINT_COUNT))
      .$usage('storage')
    points.write(
      Array.from({ length: POINT_COUNT }).map(() => ({
        position: d.vec2f(randomBell(), randomBell()),
      })),
    )
    onCleanup(() => {
      points.destroy()
    })
    const textureSize = root
      .createBuffer(d.vec2u, d.vec2u(width, height))
      .$usage('uniform')
    onCleanup(() => {
      textureSize.destroy()
    })
    const textureBuffer = root
      .createBuffer(d.arrayOf(Texel, width * height))
      .$usage('storage')
    onCleanup(() => textureBuffer.destroy())

    const bindGroup = root.createBindGroup(bindGroupLayout, {
      points,
      textureBuffer,
      textureSize,
    })

    const clearTextureBufferShaderCode = wgsl/* wgsl */ `
    ${{
      ...bindGroupLayout.bound,
    }}
  
    @compute @workgroup_size(${CLEAR_GROUP_SIZE}, 1, 1) fn computeSomething(
      @builtin(num_workgroups) num_workgroups: vec3<u32>,
      @builtin(workgroup_id) workgroup_id : vec3<u32>,
      @builtin(local_invocation_index) local_invocation_index: u32
    ) {
      let workgroup_index =
        workgroup_id.x +
        workgroup_id.y * num_workgroups.x +
        workgroup_id.z * num_workgroups.x * num_workgroups.y;
  
      let global_invocation_index = workgroup_index * ${CLEAR_GROUP_SIZE} + local_invocation_index;

      textureBuffer[global_invocation_index].count = 0;
    }
  `

    const clearTextureBufferModule = device.createShaderModule({
      code: clearTextureBufferShaderCode,
    })

    const clearTextureBufferPipeline = device.createComputePipeline({
      layout: device.createPipelineLayout({
        bindGroupLayouts: [root.unwrap(bindGroupLayout)],
      }),
      compute: {
        module: clearTextureBufferModule,
      },
    })

    const ifsShaderCode = wgsl/* wgsl */ `
    ${{
      ...bindGroupLayout.bound,
    }}
  
    @compute @workgroup_size(${IFS_GROUP_SIZE}, 1, 1) fn computeSomething(
      @builtin(num_workgroups) num_workgroups: vec3<u32>,
      @builtin(workgroup_id) workgroup_id : vec3<u32>,
      @builtin(local_invocation_index) local_invocation_index: u32
    ) {
      let workgroup_index =
        workgroup_id.x +
        workgroup_id.y * num_workgroups.x +
        workgroup_id.z * num_workgroups.x * num_workgroups.y;
  
      let i = workgroup_index * ${IFS_GROUP_SIZE} + local_invocation_index;

      let pos = vec2u(points[i].position * vec2f(textureSize));

      if (pos.x < 0 || pos.x >= textureSize.x || pos.y < 0 || pos.y >= textureSize.y) {
        return;
      }

      let index = pos.y * textureSize.x + pos.x;

      let p = (points[i].position - vec2(0.5));
      let speed = vec2f(-p.y, p.x);
      points[i].position += 0.0005 * speed / dot(speed, speed);

      textureBuffer[index].count += 1;
    }
  `

    const ifsModule = device.createShaderModule({
      code: ifsShaderCode,
    })

    const ifsPipeline = device.createComputePipeline({
      layout: device.createPipelineLayout({
        bindGroupLayouts: [root.unwrap(bindGroupLayout)],
      }),
      compute: {
        module: ifsModule,
      },
    })

    const renderShaderCode = wgsl/* wgsl */ `
    ${{
      textureBuffer: bindGroupLayout.bound.textureBuffer,
      textureSize: bindGroupLayout.bound.textureSize,
    }}

    @vertex fn vs(
      @builtin(vertex_index) vertexIndex : u32
    ) -> @builtin(position) vec4f {
      let pos = array(
        vec2f(-1, -1),
        vec2f(3, -1),
        vec2f(-1, 3)
      );

      return vec4f(pos[vertexIndex], 0.0, 1.0);
    }

    @fragment fn fs(@builtin(position) pos: vec4f) -> @location(0) vec4f {
      let pos2u = vec2u(pos.xy);
      if (pos2u.x >= textureSize.x || pos2u.y >= textureSize.y) {
        discard;
      }
      let index = pos2u.y * textureSize.x + pos2u.x;
      let count = f32(textureBuffer[index].count);
      if (count == 0) {
        discard;
      }
      return vec4f(vec3f(count / 5, count / 6, count / 8), 1.0);
    }
  `

    const renderModule = device.createShaderModule({
      code: renderShaderCode,
    })

    const renderPipeline = device.createRenderPipeline({
      layout: device.createPipelineLayout({
        bindGroupLayouts: [root.unwrap(bindGroupLayout)],
      }),
      vertex: {
        module: renderModule,
      },
      fragment: {
        module: renderModule,
        targets: [
          {
            format: navigator.gpu.getPreferredCanvasFormat(),
          },
        ],
      },
    })

    createAnimationFrame(() => {
      // Encode commands to do the computation
      const encoder = device.createCommandEncoder()
      {
        const pass = encoder.beginComputePass()
        pass.setPipeline(clearTextureBufferPipeline)
        pass.setBindGroup(0, root.unwrap(bindGroup))
        pass.dispatchWorkgroups(
          ceil(width / CLEAR_GROUP_SIZE),
          ceil(height / CLEAR_GROUP_SIZE),
          CLEAR_GROUP_SIZE,
        )
        pass.setPipeline(ifsPipeline)
        pass.setBindGroup(0, root.unwrap(bindGroup))
        pass.dispatchWorkgroups(
          POINT_COUNT / (IFS_GROUP_SIZE * IFS_GROUP_SIZE),
          IFS_GROUP_SIZE,
          1,
        )
        pass.end()
      }
      {
        const pass = encoder.beginRenderPass({
          colorAttachments: [
            {
              loadOp: 'clear',
              storeOp: 'store',
              clearValue: [0, 0.2, 0.4, 1],
              view: context.getCurrentTexture().createView(),
            },
          ],
        })
        pass.setPipeline(renderPipeline)
        pass.setBindGroup(0, root.unwrap(bindGroup))
        pass.draw(3, 1)
        pass.end()
      }

      device.queue.submit([encoder.finish()])
    })
  })
  return null
}

export function App() {
  return (
    <div class={ui.fullscreen}>
      <Root adapterOptions={{ powerPreference: 'high-performance' }}>
        <AutoCanvas>
          <Flam3 />
        </AutoCanvas>
      </Root>
    </div>
  )
}
