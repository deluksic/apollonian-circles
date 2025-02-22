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
import { premultipliedAlphaBlend } from './utils/blendModes'
import { random } from './shaders/random'

const { ceil } = Math

const CLEAR_GROUP_SIZE = 8
const IFS_GROUP_SIZE = 32
const POINT_COUNT = 5e6

const Point = d.struct({
  position: d.vec2f,
})

const bindGroupLayout = tgpu.bindGroupLayout({
  points: {
    storage: (length: number) => d.arrayOf(Point, length),
    access: 'mutable',
  },
  outputTexture: {
    storageTexture: 'r32uint',
    access: 'mutable',
    visibility: ['compute', 'fragment'],
  },
  outputTextureSize: {
    uniform: d.vec2f,
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

    onCleanup(() => {
      points.destroy()
    })

    const outputTextureSize = root
      .createBuffer(d.vec2f, d.vec2f(width, height))
      .$usage('uniform')
    onCleanup(() => {
      outputTextureSize.destroy()
    })

    const outputTexture = root['~unstable']
      .createTexture({
        format: 'r32uint',
        size: [width, height],
      })
      .$usage('storage')
    onCleanup(() => outputTexture.destroy())

    const bindGroup = root.createBindGroup(bindGroupLayout, {
      points,
      outputTexture,
      outputTextureSize,
    })

    const clearTextureBufferShaderCode = wgsl/* wgsl */ `
      ${{ ...bindGroupLayout.bound }}

      @compute @workgroup_size(${CLEAR_GROUP_SIZE}, ${CLEAR_GROUP_SIZE}, 1) fn computeSomething(
        @builtin(workgroup_id) workgroup_id : vec3u,
        @builtin(local_invocation_id) local_invocation_id: vec3u
      ) {
        let pixelPosition = workgroup_id.xy * vec2u(${CLEAR_GROUP_SIZE}) + local_invocation_id.xy;
        textureStore(outputTexture, pixelPosition, vec4u(0));
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

    const initPointsShaderCode = wgsl/* wgsl */ `
    ${{ ...bindGroupLayout.bound, random }}
  
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
      points[i].position = vec2f(
        random(i) + random(i << 4) + random(i << 8),
        random(i << 5) + random(i << 9) + random(i << 17)
      ) / 3;
    }
  `

    const initPointsModule = device.createShaderModule({
      code: initPointsShaderCode,
    })

    const initPointsPipeline = device.createComputePipeline({
      layout: device.createPipelineLayout({
        bindGroupLayouts: [root.unwrap(bindGroupLayout)],
      }),
      compute: {
        module: initPointsModule,
      },
    })

    const ifsShaderCode = wgsl/* wgsl */ `
    ${{ ...bindGroupLayout.bound }}
  
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

      var position = points[i].position;
      for(var i = 0; i < 1; i += 1) {
        let p = (position - vec2(0.5));
        let speed = vec2f(-p.y, p.x);
        position += 0.0005 * speed / dot(speed, speed);

        let pixelPosition = vec2i(position * outputTextureSize);
        let prevCount = textureLoad(outputTexture, pixelPosition);
        textureStore(outputTexture, pixelPosition, prevCount + 1);
      }

      // write back the point
      points[i].position = position;
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
        outputTexture: bindGroupLayout.bound.outputTexture,
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
        let count = f32(textureLoad(outputTexture, pos2u).x);
        return vec4f(vec3f(count / 10, count / 12, count / 20), count / 10);
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
            blend: premultipliedAlphaBlend,
          },
        ],
      },
    })

    {
      const encoder = device.createCommandEncoder()
      {
        const pass = encoder.beginComputePass()
        pass.setPipeline(initPointsPipeline)
        pass.setBindGroup(0, root.unwrap(bindGroup))
        pass.dispatchWorkgroups(
          POINT_COUNT / (IFS_GROUP_SIZE * IFS_GROUP_SIZE),
          IFS_GROUP_SIZE,
          1,
        )
        pass.end()
      }

      device.queue.submit([encoder.finish()])
    }

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
          1,
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
              clearValue: [0, 0, 0, 1],
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
        <AutoCanvas class={ui.canvas} pixelRatio={1 / window.devicePixelRatio}>
          <Flam3 />
        </AutoCanvas>
      </Root>
    </div>
  )
}
