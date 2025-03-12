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
import { Card } from './ControlCard'

export function App() {
  const [pixelRatio, setPixelRatio] = createSignal(0.25)
  const [outerIters, setOuterIters] = createSignal(3)
  const [skipIters, setSkipIters] = createSignal(5)
  const [pointCount, setPointCount] = createSignal(1e5)
  const [exposure, setExposure] = createSignal(0)
  const [maxChroma, setMaxChroma] = createSignal(0.2)
  const [drawMode, setDrawMode] = createSignal(lightMode)
  const [backgroundColor, setBackgroundColor] = createSignal(vec3f(0, 0, 0))
  const [enableBlur, setEnableBlur] = createSignal(true)
  return (
    <div class={ui.fullscreen}>
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
          Enable blur
          <input
            type="checkbox"
            checked={enableBlur()}
            onInput={(ev) => setEnableBlur(ev.target.checked)}
          />
        </label>
        <label class={ui.labeledInput}>
          Background Color
          <input
            type="color"
            onInput={(ev) => setBackgroundColor(hexToRgbNorm(ev.target.value))}
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
              enableBlur={enableBlur()}
            />
          </WheelZoomCamera2D>
        </AutoCanvas>
      </Root>
    </div>
  )
}
