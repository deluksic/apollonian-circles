import { batch, createSignal, For } from 'solid-js'
import styles from './App.module.css'
import { frags } from './frags'
import { Test } from './Test'
import { v2f, vec2f } from 'typegpu/data'
import { Root } from './lib/Root'
import { AutoCanvas } from './lib/AutoCanvas'
import { Camera2D } from './Camera2D'

const { random } = Math

export function App() {
  const [selectedFrag, setSelectedFrag] = createSignal(frags.default)
  const [translation, setTranslation] = createSignal<v2f>(vec2f())
  const [zoom, setZoom] = createSignal(1)
  const [cameraPosition, setCameraPosition] = createSignal(vec2f())
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
          onWheel={(ev) => {
            ev.preventDefault()
            const rect = ev.target.getBoundingClientRect()
            const centerX = rect.x + rect.width / 2
            const centerY = rect.y + rect.height / 2
            const mx = ((ev.clientX - centerX) / rect.height) * 2
            const my = ((centerY - ev.clientY) / rect.height) * 2
            const oldZoom = zoom()
            const newZoom = oldZoom * (1 - ev.deltaY * 0.001)
            const ratio = oldZoom / newZoom
            batch(() => {
              setCameraPosition(({ x, y }) =>
                vec2f(
                  x + (mx * (1 - ratio)) / oldZoom,
                  y + (my * (1 - ratio)) / oldZoom,
                ),
              )
              console.log(oldZoom)
              setZoom(newZoom)
            })
          }}
          onClick={() => {
            setColor({ r: random(), g: random(), b: random(), a: 0 })
            setTranslation(vec2f(random() - 0.5, random() - 0.5))
          }}
        >
          <AutoCanvas class={styles.canvas}>
            <Camera2D position={cameraPosition()} fovy={1 / zoom()}>
              <Test
                clearColor={color()}
                translation={translation()}
                frag={selectedFrag()}
              />
            </Camera2D>
          </AutoCanvas>
        </div>
      </Root>
    </div>
  )
}
