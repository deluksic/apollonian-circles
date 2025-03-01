import ui from './App.module.css'
import { AutoCanvas } from './lib/AutoCanvas'
import { Root } from './lib/Root'
import { createSignal } from 'solid-js'
import { WheelZoomCamera2D } from './lib/WheelZoomCamera2D'
import {
  Flam3,
  MAX_INNER_ITERS,
  MAX_OUTER_ITERS,
  MAX_POINT_COUNT,
} from './flame/Flam3'
import { vec3f } from 'typegpu/data'
import { hexToRgbNorm } from './utils/hexToRgb'
import { lightMode, paintMode } from './flame/drawMode'

export function App() {
  const [pixelRatio, setPixelRatio] = createSignal(0.25)
  const [outerIters, setOuterIters] = createSignal(3)
  const [skipIters, setSkipIters] = createSignal(5)
  const [pointCount, setPointCount] = createSignal(1e5)
  const [drawMode, setDrawMode] = createSignal(lightMode)
  const [backgroundColor, setBackgroundColor] = createSignal(vec3f(0, 0, 0))
  return (
    <div class={ui.fullscreen}>
      <div class={ui.overlay}>
        <label>
          Resolution
          <input
            type="range"
            min={0.125}
            max={1}
            step={0.125}
            value={pixelRatio()}
            onInput={(ev) => setPixelRatio(ev.target.valueAsNumber)}
          />
          {pixelRatio()}
        </label>
        <label>
          Outer Iterations
          <input
            type="range"
            min={0}
            max={MAX_OUTER_ITERS}
            step={1}
            value={outerIters()}
            onInput={(ev) => setOuterIters(ev.target.valueAsNumber)}
          />
          {outerIters()}
        </label>
        <label>
          Skip Iterations
          <input
            type="range"
            min={0}
            max={MAX_INNER_ITERS}
            step={1}
            value={skipIters()}
            onInput={(ev) => setSkipIters(ev.target.valueAsNumber)}
          />
          {skipIters()}
        </label>
        <label>
          Point Count
          <input
            type="range"
            min={0}
            max={MAX_POINT_COUNT}
            step={1e4}
            value={pointCount()}
            onInput={(ev) => setPointCount(ev.target.valueAsNumber)}
          />
          {(pointCount() / 1000).toFixed(0)} K
        </label>
        <label>
          Background Color
          <input
            type="color"
            onInput={(ev) => setBackgroundColor(hexToRgbNorm(ev.target.value))}
          />
        </label>
        <label>
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
            />
          </WheelZoomCamera2D>
        </AutoCanvas>
      </Root>
    </div>
  )
}
