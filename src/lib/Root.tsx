import { createResource, onCleanup, ParentProps, Show } from 'solid-js'
import { tgpu } from 'typegpu/experimental'
import { RootContextProvider } from './RootContext'

type RootProps = {
  adapterOptions?: GPURequestAdapterOptions
}

export function Root(props: ParentProps<RootProps>) {
  const [webgpu] = createResource(
    () => ({ adapterOptions: props.adapterOptions }),
    async ({ adapterOptions }) => {
      onCleanup(() => {
        root?.destroy()
        device?.destroy()
      })
      const adapter = await navigator.gpu?.requestAdapter(adapterOptions)
      if (!adapter) {
        throw new Error(
          `Failed to get GPUAdapter, make sure to use a browser with WebGPU support.`,
        )
      }
      const device = await adapter?.requestDevice()
      if (!device) {
        throw new Error(
          `Failed to get GPUDevice, make sure to use a browser with WebGPU support.`,
        )
      }
      const root = tgpu.initFromDevice({ device })
      return { adapter, device, root }
    },
  )

  return (
    <Show when={webgpu()} keyed>
      {(webgpu) => (
        <RootContextProvider value={webgpu}>
          {props.children}
        </RootContextProvider>
      )}
    </Show>
  )
}
