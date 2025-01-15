import { mat3x3f, mat4x4f, struct, v2f, vec2f, vec3f } from 'typegpu/data'
import tgpu from 'typegpu'
import { CameraContextProvider } from './CameraContext'
import { createMemo, ParentProps } from 'solid-js'
import { useCanvas } from './CanvasContext'
import { useRootContext } from './RootContext'
import { mat3, mat4, vec3 } from 'wgpu-matrix'

export const Camera2DUniforms = struct({
  viewMatrix: mat3x3f,
  viewMatrixInverse: mat3x3f,
  resolution: vec2f,
}).$name('Camera2DUniforms')

export const Camera2DBindGroupLayout = tgpu
  .bindGroupLayout({
    camera2DUniforms: { uniform: Camera2DUniforms },
  })
  .$name('Camera2DBindGroupLayout')

export const camera2DWorldToClip = tgpu['~unstable']
  .fn([vec2f], vec2f)
  .does(
    /* wgsl */ `(world: vec2f) -> vec2f {
      let clip = camera2DUniforms.viewMatrix * vec3(world, 1);
      return clip.xy / clip.z;
    }`,
  )
  .$uses({ ...Camera2DBindGroupLayout.bound })
  .$name('camera2DWorldToClip')

export const camera2DClipToWorld = tgpu['~unstable']
  .fn([vec2f], vec2f)
  .does(
    /* wgsl */ `(clip: vec2f) -> vec2f {
      let world = camera2DUniforms.viewMatrixInverse * vec3(clip, 1);
      return world.xy / world.z;
    }`,
  )
  .$uses({ ...Camera2DBindGroupLayout.bound })
  .$name('camera2DClipToWorld')

export const camera2DClipToPixels = tgpu['~unstable']
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
  const zoom = () => 1 / props.fovy

  const uniformsBuffer = root
    .createBuffer(Camera2DUniforms)
    .$usage('uniform')
    .$name('Camera2DUniforms')

  const uniformBindGroup = Camera2DBindGroupLayout.populate({
    camera2DUniforms: uniformsBuffer,
  })

  const uniforms = createMemo(() => {
    const { position, fovy } = props
    const { x, y } = position
    const { width, height } = canvasSize()
    const aspect = width / height
    const viewMatrix4 = mat4x4f()
    mat4.ortho(
      x - aspect * fovy,
      x + aspect * fovy,
      y - fovy,
      y + fovy,
      0,
      0,
      viewMatrix4,
    )
    // prettier-ignore
    const viewMatrix = mat3x3f(
      viewMatrix4.columns[0]!.xyw,
      viewMatrix4.columns[1]!.xyw,
      viewMatrix4.columns[3]!.xyw,
    )
    const viewMatrixInverse = mat3.inverse(viewMatrix, mat3x3f())
    return {
      viewMatrix,
      viewMatrixInverse,
      resolution: vec2f(width, height),
    }
  })

  function clipToWorld({ x, y }: v2f) {
    return vec3.transformMat3(
      vec3f(x, y, 1),
      uniforms().viewMatrixInverse,
      vec2f(),
    )
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
        wgsl: {
          worldToClip: camera2DWorldToClip,
          clipToWorld: camera2DClipToWorld,
          clipToPixels: camera2DClipToPixels,
        },
        js: {
          clipToWorld,
        },
        zoom,
      }}
    >
      {props.children}
    </CameraContextProvider>
  )
}
