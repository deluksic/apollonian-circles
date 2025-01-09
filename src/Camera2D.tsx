import { mat3x3f, struct, v2f, Vec2f, vec2f, vec3f } from 'typegpu/data'
import tgpu from 'typegpu/experimental'
import { CameraContextProvider } from './CameraContext'
import { createEffect, ParentProps } from 'solid-js'
import { useCanvas } from './lib/CanvasContext'
import { useRootContext } from './lib/RootContext'

export const Camera2DUniforms = struct({
  viewMatrix: mat3x3f,
})

export const Camera2DBindGroupLayout = tgpu.bindGroupLayout({
  camera2DUniforms: { uniform: Camera2DUniforms },
})

export const camera2DPositionTransform = tgpu
  .fn([vec2f], vec3f)
  .does(
    /* wgsl */ `(position: vec2f) -> vec3f {
      return camera2DUniforms.viewMatrix * vec3f(position, 1);
    }`,
  )
  .$uses({ ...Camera2DBindGroupLayout.bound })

export const camera2DDirectionTransform = tgpu
  .fn([vec2f], vec2f)
  .does(
    /* wgsl */ `(direction: vec2f) -> vec2f {
      return (camera2DUniforms.viewMatrix * vec3f(position, 0)).xy;
    }`,
  )
  .$uses({ ...Camera2DBindGroupLayout.bound })

type Camera2DProps = {
  position: v2f
  fovy: number
}

export function Camera2D(props: ParentProps<Camera2DProps>) {
  const { root } = useRootContext()
  const { canvasSize } = useCanvas()
  const aspectRatio = () => {
    const { width, height } = canvasSize()
    return width / height
  }

  const uniformsBuffer = root
    .createBuffer(Camera2DUniforms)
    .$usage('uniform')
    .$name('Camera2DUniforms')

  const uniformBindGroup = Camera2DBindGroupLayout.populate({
    camera2DUniforms: uniformsBuffer,
  })

  const viewMatrix = () => {
    const { position, fovy } = props
    const { x, y } = position
    const aspect = aspectRatio()
    // prettier-ignore
    return mat3x3f(
      1 / fovy, 0, 0,
      0, aspect / fovy, 0,
      -x / fovy, -y / fovy, 1,
    )
  }

  createEffect(() => {
    uniformsBuffer.write({ viewMatrix: viewMatrix() })
  })

  return (
    <CameraContextProvider
      value={{
        cameraBindGroup: uniformBindGroup,
        CameraBindGroupLayout: Camera2DBindGroupLayout,
        positionTransform: camera2DPositionTransform,
        directionTransform: camera2DDirectionTransform,
      }}
    >
      {props.children}
    </CameraContextProvider>
  )
}
