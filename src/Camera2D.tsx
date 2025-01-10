import { mat3x3f, struct, v2f, vec2f } from 'typegpu/data'
import tgpu from 'typegpu/experimental'
import { CameraContextProvider } from './CameraContext'
import { ParentProps } from 'solid-js'
import { useCanvas } from './lib/CanvasContext'
import { useRootContext } from './lib/RootContext'
import { mat3 } from 'wgpu-matrix'

export const Camera2DUniforms = struct({
  viewMatrix: mat3x3f,
  viewMatrixInverse: mat3x3f,
  resolution: vec2f,
})

export const Camera2DBindGroupLayout = tgpu.bindGroupLayout({
  camera2DUniforms: { uniform: Camera2DUniforms },
})

export const camera2DWorldToClip = tgpu
  .fn([vec2f], vec2f)
  .does(
    /* wgsl */ `(world: vec2f) -> vec2f {
      let clip = camera2DUniforms.viewMatrix * vec3(world, 1);
      return clip.xy / clip.z;
    }`,
  )
  .$uses({ ...Camera2DBindGroupLayout.bound })
  .$name('camera2DWorldToClip')

export const camera2DClipToWorld = tgpu
  .fn([vec2f], vec2f)
  .does(
    /* wgsl */ `(clip: vec2f) -> vec2f {
      let world = camera2DUniforms.viewMatrixInverse * vec3(clip, 1);
      return world.xy / world.z;
    }`,
  )
  .$uses({ ...Camera2DBindGroupLayout.bound })
  .$name('camera2DClipToWorld')

export const camera2DClipToPixels = tgpu
  .fn([vec2f], vec2f)
  .does(
    /* wgsl */ `(clip: vec2f) -> vec2f {
      return 0.5 * clip * camera2DUniforms.resolution;
    }`,
  )
  .$uses({ ...Camera2DBindGroupLayout.bound })
  .$name('camera2DClipToPixels')

type Camera2DProps = {
  position: v2f
  fovy: number
}

export function Camera2D(props: ParentProps<Camera2DProps>) {
  const { root } = useRootContext()
  const { canvasSize } = useCanvas()

  const uniformsBuffer = root
    .createBuffer(Camera2DUniforms)
    .$usage('uniform')
    .$name('Camera2DUniforms')

  const uniformBindGroup = Camera2DBindGroupLayout.populate({
    camera2DUniforms: uniformsBuffer,
  })

  const uniforms = () => {
    const { position, fovy } = props
    const { x, y } = position
    const { width, height } = canvasSize()
    const aspect = width / height
    // prettier-ignore
    const viewMatrix = mat3x3f(
      1 / fovy / aspect, 0, 0,
      0, 1 / fovy, 0,
      -x / fovy / aspect, -y / fovy, 1,
    )
    const viewMatrixInverse = mat3x3f(...mat3.inverse(viewMatrix))
    return {
      viewMatrix,
      viewMatrixInverse,
      resolution: vec2f(width, height),
    }
  }

  function update() {
    uniformsBuffer.write(uniforms())
  }

  return (
    <CameraContextProvider
      value={{
        update,
        bindGroup: uniformBindGroup,
        BindGroupLayout: Camera2DBindGroupLayout,
        worldToClip: camera2DWorldToClip,
        clipToWorld: camera2DClipToWorld,
        clipToPixels: camera2DClipToPixels,
      }}
    >
      {props.children}
    </CameraContextProvider>
  )
}
