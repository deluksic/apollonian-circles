import { createSignal, For } from 'solid-js'
import ui from './App.module.css'
import { frags } from './frags'
import { Root } from './lib/Root'
import { AutoCanvas } from './lib/AutoCanvas'

export function App() {
  const [selectedFrag, setSelectedFrag] = createSignal(frags.frag4)

  return (
    <div class={ui.fullscreen}>
      <For each={Object.entries(frags)}>
        {([key, frag]) => (
          <label onPointerDown={() => setSelectedFrag(() => frag)}>
            <input name="frag" type="radio" checked={selectedFrag() === frag} />
            {key}
          </label>
        )}
      </For>
      <Root>
        <div class={ui.canvasContainer}>
          <AutoCanvas class={ui.canvas}></AutoCanvas>
        </div>
      </Root>
    </div>
  )
}
