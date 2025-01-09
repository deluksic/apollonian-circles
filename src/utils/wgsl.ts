import tgpu from 'typegpu/experimental'

type Wgsl = Parameters<typeof tgpu.resolve>['0']['externals']

export function wgsl(strings: TemplateStringsArray, ...externals: Wgsl[]) {
  return tgpu.resolve({
    template: strings.join(''),
    externals: Object.assign({}, ...externals),
  })
}
