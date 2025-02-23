import ui from './App.module.css'
import * as d from 'typegpu/data'
import { AutoCanvas } from './lib/AutoCanvas'
import { useCanvas } from './lib/CanvasContext'
import { Root } from './lib/Root'
import { useRootContext } from './lib/RootContext'
import { wgsl } from './utils/wgsl'
import { createAnimationFrame } from './utils/createAnimationFrame'
import { createEffect, onCleanup } from 'solid-js'
import { createClearTexturePipeline } from './flame/clearTexture'
import { bindGroupLayout, Point } from './flame/types'
import { createColorGradingPipeline } from './flame/colorGrading'
import { createInitPointsPipeline } from './flame/initPoints'

const IFS_GROUP_SIZE = 32
const POINT_COUNT = 2e6

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
    })

    const runInitPoints = createInitPointsPipeline(root, bindGroup, POINT_COUNT)
    const runColorGradingPipeline = createColorGradingPipeline(root, bindGroup)
    const runClearTexture = createClearTexturePipeline(
      root,
      bindGroup,
      outputTexture,
    )

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

        let outputTextureSize = vec2f(textureDimensions(outputTexture));

        var position = points[i].position;

        let p = (position - vec2(0.5));
        let speed = vec2f(-p.y, p.x);
        position += 0.0005 * speed / dot(speed, speed);

        let pixelPosition = vec2i(position * outputTextureSize);
        let prevCount = textureLoad(outputTexture, pixelPosition);
        textureStore(outputTexture, pixelPosition, prevCount + 1);

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

    {
      // init points
      const encoder = device.createCommandEncoder()
      const pass = encoder.beginComputePass()
      runInitPoints(pass)
      pass.end()
      device.queue.submit([encoder.finish()])
    }

    createAnimationFrame(() => {
      // Encode commands to do the computation
      const encoder = device.createCommandEncoder()
      {
        const pass = encoder.beginComputePass()
        runClearTexture(pass)
        pass.setPipeline(ifsPipeline)
        pass.setBindGroup(0, root.unwrap(bindGroup))
        pass.dispatchWorkgroups(
          POINT_COUNT / (IFS_GROUP_SIZE * IFS_GROUP_SIZE),
          IFS_GROUP_SIZE,
          1,
        )
        pass.end()
      }

      runColorGradingPipeline(encoder, context)

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
