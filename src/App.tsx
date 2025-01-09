import { createSignal, For } from 'solid-js'
import styles from './App.module.css'
import { frags } from './frags'
import { Test } from './Test'
import { v2f, vec2f } from 'typegpu/data'
import { Root } from './lib/Root'
import { AutoCanvas } from './lib/AutoCanvas'

const { random } = Math

export function App() {
  const [selectedFrag, setSelectedFrag] = createSignal(frags.default)
  const [translation, setTranslation] = createSignal<v2f>(vec2f())
  const [color, setColor] = createSignal<GPUColor>({ r: 0, g: 0, b: 0, a: 1 })
  return (
    <div class={styles.fullscreen}>
      <For each={Object.entries(frags)}>
        {([key, frag]) => (
          <label onPointerDown={() => setSelectedFrag(() => frag)}>
            <input name="frag" type="radio" checked={selectedFrag() === frag} />
            {key}
          </label>
        )}
      </For>
      <Root>
        <div
          class={styles.canvasContainer}
          onClick={() => {
            setColor({ r: random(), g: random(), b: random(), a: 0 })
            setTranslation(vec2f(random() - 0.5, random() - 0.5))
          }}
        >
          <AutoCanvas class={styles.canvas}>
            <Test
              clearColor={color()}
              translation={translation()}
              frag={selectedFrag()}
            />
          </AutoCanvas>
        </div>
        <div
          class={styles.canvasContainer}
          onClick={() => {
            setColor({ r: random(), g: random(), b: random(), a: 0 })
            setTranslation(vec2f(random() - 0.5, random() - 0.5))
          }}
        >
          <AutoCanvas class={styles.canvas}>
            <Test
              clearColor={color()}
              translation={translation()}
              frag={selectedFrag()}
            />
          </AutoCanvas>
        </div>
      </Root>
    </div>
  )
}
