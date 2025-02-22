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

// const random = tgpu['~unstable'].fn([d.u32], d.f32).does(/* wgsl */ `
//   (i: u32) -> f32 {
//     var x = i ^ (i >> 17);
//     x *= 0xed5ad4bbu;
//     x ^= x >> 11;
//     x *= 0xac4c1b51u;
//     x ^= x >> 15;
//     x *= 0x31848babu;
//     x ^= x >> 14;
//     return f32(x) / f32(0xffffffffu);
//   }
// `)

const random2 = tgpu['~unstable'].fn([d.vec2u], d.f32).does(/* wgsl */ `
  (i: vec2u) -> f32 {
    var x = i.x ^ (i.x >> 17);
    x *= 0xed5ad4bbu;
    x ^= x >> 11;
    x *= 0xac4c1b51u;
    x ^= x >> 15;
    x *= 0x31848babu;
    x ^= x >> 14;
    var y = i.y ^ (x >> 17);
    y *= 0xed5ad4bbu;
    y ^= y >> 11;
    y *= 0xac4c1b51u;
    y ^= y >> 15;
    y *= 0x31848babu;
    y ^= y >> 14;
    return f32(y) / f32(0xffffffffu);
  }
`)

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

    const outputTextureSize = root
      .createBuffer(d.vec2u, d.vec2u(width, height))
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
        let x = global_invocation_index % outputTextureSize.x;
        let y = global_invocation_index / outputTextureSize.x;

        textureStore(outputTexture, vec2u(x, y), vec4u(0));
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

      let p = (points[i].position - vec2(0.5));
      let speed = vec2f(-p.y, p.x);
      points[i].position += 0.0005 * speed / dot(speed, speed);

      let pixelPosition = vec2u(points[i].position * vec2f(outputTextureSize));
      if (pixelPosition.x < 0 || pixelPosition.x >= outputTextureSize.x ||
          pixelPosition.y < 0 || pixelPosition.y >= outputTextureSize.y) {
        return;
      }

      let prevCount = textureLoad(outputTexture, pixelPosition);
      textureStore(outputTexture, pixelPosition, prevCount + 1);
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
        outputTextureSize: bindGroupLayout.bound.outputTextureSize,
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
        if (pos2u.x >= outputTextureSize.x || pos2u.y >= outputTextureSize.y) {
          discard;
        }
        let count = f32(textureLoad(outputTexture, pos2u).x);
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
              clearValue: [0.5, 0.8, 1, 1],
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
