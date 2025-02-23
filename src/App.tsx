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
import { bindGroupLayout, ComputeUniforms, Point } from './flame/types'
import { createColorGradingPipeline } from './flame/colorGrading'
import { createInitPointsPipeline } from './flame/initPoints'
import { WheelZoomCamera2D } from './lib/WheelZoomCamera2D'
import { useCamera } from './lib/CameraContext'
import { hash } from './shaders/random'

const IFS_GROUP_SIZE = 32
const POINT_COUNT = 1e6

function Flam3() {
  const camera = useCamera()
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

    const uniformBuffer = root
      .createBuffer(ComputeUniforms, { seed: 0 })
      .$usage('uniform')

    const bindGroup = root.createBindGroup(bindGroupLayout, {
      points,
      outputTexture,
      computeUniforms: uniformBuffer,
    })

    const runInitPoints = createInitPointsPipeline(root, bindGroup, POINT_COUNT)
    const runColorGradingPipeline = createColorGradingPipeline(
      root,
      outputTexture,
    )
    const runClearTexture = createClearTexturePipeline(
      root,
      bindGroup,
      outputTexture,
    )

    const ifsShaderCode = wgsl/* wgsl */ `
      ${{
        ...camera.BindGroupLayout.bound,
        ...bindGroupLayout.bound,
        worldToClip: camera.wgsl.worldToClip,
        hash,
      }}

      fn draw(position: vec2f) {
        let outputTextureSize = vec2f(textureDimensions(outputTexture));
        let clip = worldToClip(position);
        let pixelPosition = vec2i(0.5 * (clip * vec2f(1, -1) + 1) * outputTextureSize);
        let prevCount = textureLoad(outputTexture, pixelPosition);
        textureStore(outputTexture, pixelPosition, prevCount + 1);
      }
    
      @compute @workgroup_size(${IFS_GROUP_SIZE}, 1, 1) fn computeSomething(
        @builtin(num_workgroups) num_workgroups: vec3<u32>,
        @builtin(workgroup_id) workgroup_id : vec3<u32>,
        @builtin(local_invocation_index) local_invocation_index: u32
      ) {
        let workgroup_index =
          workgroup_id.x +
          workgroup_id.y * num_workgroups.x +
          workgroup_id.z * num_workgroups.x * num_workgroups.y;
    
        let global_invocation_index = workgroup_index * ${IFS_GROUP_SIZE} + local_invocation_index;

        var position = points[global_invocation_index].position;

        // let speed = vec2f(-position.y, position.x);
        // position += 0.0005 * speed / dot(speed, speed);
        // let affine = mat3x2f(1, 0, 0, 1, 0, 0);
        let affine1 = mat3x2f(0.5, 0,   0, 0.5,   0.5, 0);
        let affine2 = mat3x2f(0.5, 0,   0, 0.5,   0, 0.5);
        let affine3 = mat3x2f(0.5, 0,   0, 0.5,   -0.5, -0.5);
        let trans = array(affine1, affine2, affine3);

        var seed = computeUniforms.seed ^ hash(workgroup_index);
        for(var i = 0; i < 20; i += 1) {
          seed = hash(seed);
          let affine = trans[seed % 3];
          position = affine * vec3f(position, 1.);
          if (i >= 5) {
            draw(position);
          }
        }
      }
    `

    const ifsModule = device.createShaderModule({
      code: ifsShaderCode,
    })

    const ifsPipeline = device.createComputePipeline({
      layout: device.createPipelineLayout({
        bindGroupLayouts: [
          root.unwrap(camera.BindGroupLayout),
          root.unwrap(bindGroupLayout),
        ],
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
      camera.update()
      uniformBuffer.write({ seed: Math.random() * 0xffff })
      // Encode commands to do the computation
      const encoder = device.createCommandEncoder()
      {
        const pass = encoder.beginComputePass()
        runClearTexture(pass)
        pass.setPipeline(ifsPipeline)
        pass.setBindGroup(0, root.unwrap(camera.bindGroup))
        pass.setBindGroup(1, root.unwrap(bindGroup))
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
        <AutoCanvas class={ui.canvas} pixelRatio={1}>
          <WheelZoomCamera2D>
            <Flam3 />
          </WheelZoomCamera2D>
        </AutoCanvas>
      </Root>
    </div>
  )
}
