import ui from './App.module.css'
import { AutoCanvas } from './lib/AutoCanvas'
import { Root } from './lib/Root'
import {
  createEffect,
  createMemo,
  createSignal,
  For,
  onCleanup,
} from 'solid-js'
import { WheelZoomCamera2D } from './lib/WheelZoomCamera2D'
import {
  Flam3,
  MAX_INNER_ITERS,
  MAX_OUTER_ITERS,
  MAX_POINT_COUNT,
} from './flame/Flam3'
import { vec2f, vec3f } from 'typegpu/data'
import { hexToRgbNorm } from './utils/hexToRgb'
import { lightMode, paintMode } from './flame/drawMode'
import { Card } from './ControlCard'
import { FlameFunction } from './flame/flameFunction'
import { createStore, produce } from 'solid-js/store'
import { Cross } from './icons/Cross'
import { Plus } from './icons/Plus'
import { sum } from './utils/sum'

const initFlameFunctions: FlameFunction[] = [
  {
    probability: 0.4,
    preAffine: { a: 0.8, b: 0, c: 0.5, d: 0, e: 0.6, f: 0 },
    postAffine: { a: 1, b: 0, c: 0, d: 0, e: 1, f: 0 },
    color: vec2f(0.1, 0.25),
    variations: [{ type: 'linear', weight: 1 }],
  },
  {
    probability: 0.3,
    preAffine: { a: 0.7, b: 0.3, c: 0.1, d: 0, e: 0.6, f: 0.5 },
    postAffine: { a: 1, b: 0, c: 0, d: 0, e: 1, f: 0 },
    color: vec2f(-0.3, 0.1),
    variations: [
      { type: 'linear', weight: 0.4 },
      { type: 'swirl', weight: 0.5 },
      { type: 'popcorn', weight: 0.1 },
    ],
  },
  {
    probability: 0.2,
    preAffine: { a: 0.6, b: 0.5, c: -0.5, d: 0, e: 0.5, f: -0.5 },
    postAffine: { a: 0, b: -1, c: 0, d: 1, e: 0, f: 0 },
    color: vec2f(0, -0.3),
    variations: [
      {
        type: 'pie',
        weight: 0.95,
        params: { rotation: 0, slices: 5, thickness: 0.5 },
      },
      { type: 'gaussian', weight: 0.05 },
    ],
  },
  {
    probability: 0.1,
    preAffine: { a: 0.6, b: 0.5, c: -0.5, d: 0, e: 0.5, f: -0.5 },
    postAffine: { a: 1, b: 0, c: 0, d: 0, e: 1, f: 0 },
    color: vec2f(1, 0),
    variations: [{ type: 'sinusoidal', weight: 1 }],
  },
]

export function App() {
  const [pixelRatio, setPixelRatio] = createSignal(0.25)
  const [outerIters, setOuterIters] = createSignal(3)
  const [skipIters, setSkipIters] = createSignal(5)
  const [pointCount, setPointCount] = createSignal(1e5)
  const [exposure, setExposure] = createSignal(0.1)
  const [maxChroma, setMaxChroma] = createSignal(0.2)
  const [drawMode, setDrawMode] = createSignal(lightMode)
  const [backgroundColor, setBackgroundColor] = createSignal(vec3f(0, 0, 0))
  const [showSidebar, setShowSidebar] = createSignal(true)
  const [adaptiveFilterEnabled, setAdaptiveFilterEnabled] = createSignal(true)
  const [flameFunctions, setFlameFunctions] = createStore(initFlameFunctions)
  const totalProbability = createMemo(() =>
    sum(flameFunctions.map((f) => f.probability)),
  )

  createEffect(() => {
    function onKeyDown(ev: KeyboardEvent) {
      if (ev.code === 'Escape') {
        setShowSidebar((p) => !p)
      }
    }
    document.addEventListener('keydown', onKeyDown)
    onCleanup(() => {
      document.removeEventListener('keydown', onKeyDown)
    })
  })

  return (
    <div class={ui.fullscreen}>
      <div class={ui.sidebar} classList={{ [ui.show]: showSidebar() }}>
        <Card>
          <label class={ui.labeledInput}>
            Resolution
            <span>
              <input
                type="range"
                min={0.125}
                max={1}
                step={0.125}
                value={pixelRatio()}
                onInput={(ev) => setPixelRatio(ev.target.valueAsNumber)}
              />
              {pixelRatio()}
            </span>
          </label>
          <label class={ui.labeledInput}>
            Outer Iterations
            <span>
              <input
                type="range"
                min={0}
                max={MAX_OUTER_ITERS}
                step={1}
                value={outerIters()}
                onInput={(ev) => setOuterIters(ev.target.valueAsNumber)}
              />
              {outerIters()}
            </span>
          </label>
          <label class={ui.labeledInput}>
            Skip Iterations
            <span>
              <input
                type="range"
                min={0}
                max={MAX_INNER_ITERS}
                step={1}
                value={skipIters()}
                onInput={(ev) => setSkipIters(ev.target.valueAsNumber)}
              />
              {skipIters()}
            </span>
          </label>
          <label class={ui.labeledInput}>
            Point Count
            <span>
              <input
                type="range"
                min={0}
                max={MAX_POINT_COUNT}
                step={1e4}
                value={pointCount()}
                onInput={(ev) => setPointCount(ev.target.valueAsNumber)}
              />
              {(pointCount() / 1000).toFixed(0)} K
            </span>
          </label>
          <label class={ui.labeledInput}>
            Exposure
            <span>
              <input
                type="range"
                min={-4}
                max={4}
                step={0.05}
                value={exposure()}
                onInput={(ev) => setExposure(ev.target.valueAsNumber)}
              />
              {exposure()}
            </span>
          </label>
          <label class={ui.labeledInput}>
            Max Chroma
            <span>
              <input
                type="range"
                min={0}
                max={0.4}
                step={0.01}
                value={maxChroma()}
                onInput={(ev) => setMaxChroma(ev.target.valueAsNumber)}
              />
              {maxChroma()}
            </span>
          </label>
          <label class={ui.labeledInput}>
            Enable adaptive filter
            <input
              type="checkbox"
              checked={adaptiveFilterEnabled()}
              onInput={(ev) => setAdaptiveFilterEnabled(ev.target.checked)}
            />
          </label>
          <label class={ui.labeledInput}>
            Background Color
            <input
              type="color"
              onInput={(ev) =>
                setBackgroundColor(hexToRgbNorm(ev.target.value))
              }
            />
          </label>
          <label class={ui.labeledInput}>
            Draw Mode
            <select
              onChange={(ev) =>
                setDrawMode(() =>
                  ev.target.value === 'light' ? lightMode : paintMode,
                )
              }
            >
              <option value="light">Light</option>
              <option value="paint">Paint</option>
            </select>
          </label>
        </Card>
        <For each={flameFunctions}>
          {(flame, i) => (
            <Card>
              <button
                class={ui.deleteFlameButton}
                onClick={() =>
                  setFlameFunctions(
                    produce((flames) => {
                      flames.splice(i(), 1)
                    }),
                  )
                }
              >
                <Cross />
              </button>
              <label class={ui.labeledInput}>
                Probability
                <span>
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.001}
                    value={flame.probability}
                    onInput={(ev) =>
                      setFlameFunctions(
                        i(),
                        'probability',
                        ev.target.valueAsNumber,
                      )
                    }
                  />
                  {((100 * flame.probability) / totalProbability()).toFixed(1)}%
                </span>
              </label>
              <For each={flame.variations}>
                {(variation, j) => (
                  <label class={ui.labeledInput}>
                    Weight {variation.type}
                    <span>
                      <input
                        type="range"
                        min={0}
                        max={1}
                        step={0.001}
                        value={variation.weight}
                        onInput={(ev) =>
                          setFlameFunctions(
                            i(),
                            'variations',
                            j(),
                            'weight',
                            ev.target.valueAsNumber,
                          )
                        }
                      />
                      {(100 * variation.weight).toFixed(1)} %
                    </span>
                  </label>
                )}
              </For>
            </Card>
          )}
        </For>
        <Card class={ui.addFlameCard}>
          <button
            class={ui.addFlameButton}
            onClick={() =>
              setFlameFunctions(
                produce((flames) => {
                  flames.push({
                    probability: 0.1,
                    color: vec2f(),
                    preAffine: { a: 1, b: 0, c: 0, d: 0, e: 1, f: 0 },
                    postAffine: { a: 1, b: 0, c: 0, d: 0, e: 1, f: 0 },
                    variations: [{ type: 'linear', weight: 1 }],
                  })
                }),
              )
            }
          >
            <Plus />
          </button>
        </Card>
      </div>
      <Root adapterOptions={{ powerPreference: 'high-performance' }}>
        <AutoCanvas class={ui.canvas} pixelRatio={pixelRatio()}>
          <WheelZoomCamera2D>
            <Flam3
              outerIters={outerIters()}
              skipIters={skipIters()}
              pointCount={pointCount()}
              drawMode={drawMode()}
              backgroundColor={backgroundColor()}
              exposure={exposure()}
              maxChroma={maxChroma()}
              adaptiveFilterEnabled={adaptiveFilterEnabled()}
              flameFunctions={flameFunctions}
            />
          </WheelZoomCamera2D>
        </AutoCanvas>
      </Root>
    </div>
  )
}
