import tgpu from 'typegpu/experimental'
import { struct, builtin, vec2f, vec4f, location } from 'typegpu/data'

export const VertexOutput = struct({
  position: builtin.position,
  positionOriginal: location(0, vec2f),
})

const frag = tgpu
  .fn([VertexOutput], vec4f)
  .does(
    /* wgsl */ `
    (in: VertexOutput) -> vec4f {
      let position = in.positionOriginal;
      let r = sin((position.x + position.y) * 10);
      let g = sin(position.y * 10);
      return vec4f(r / fwidth(r), g / fwidth(g), 1, 1);
    }
  `,
  )
  .$uses({ VertexOutput })

const frag2 = tgpu
  .fn([VertexOutput], vec4f)
  .does(
    /* wgsl */ `
    (in: VertexOutput) -> vec4f {
      let checker = (floor(in.position.x / 16) + floor(in.position.y / 16)) % 2;
      return vec4f(vec3f(checker), 1);
    }
  `,
  )
  .$uses({ VertexOutput })

const frag3 = tgpu
  .fn([VertexOutput], vec4f)
  .does(
    /* wgsl */ `
    (in: VertexOutput) -> vec4f {
      let dist = length(in.positionOriginal);
      let fade = smoothstep(0.05, 0.3, dist);
    
      let angle = atan2(in.positionOriginal.y, in.positionOriginal.x);
      let wave = sin(angle * 17);
      let waveflat = clamp(wave / fwidth(wave), 0, 1);

      let color = mix(vec3f(1, 1, 1), vec3f(1, 0, 0), waveflat);
      return vec4f(color, fade);
    }
  `,
  )
  .$uses({ VertexOutput })

export type TestFrag = (typeof frags)[keyof typeof frags]
export const frags = {
  default: frag3,
  frag,
  frag2,
  frag3,
}
