import { BufferWriter } from 'typed-binary'
import tgpu from 'typegpu'
import { AnyData, Infer } from 'typegpu/data'

const accessRecorderPath = Symbol('accessRecorderPath')
type AccessRecorder = {
  [accessRecorderPath]: string[]
}

/**
 * Creates a proxy for recording nested property access.
 * Example:
 * ```
 * const spy = createAccessRecorder()
 * const result = spy.access.some.property
 * console.log(result[accessRecorderPath]) // ['access', 'some', 'property']
 * ```
 */
function createAccessRecorder(path: string[] = []): AccessRecorder {
  return new Proxy(
    {},
    {
      get(target, property, receiver) {
        if (property === accessRecorderPath) {
          return path
        }
        if (typeof property === 'symbol') {
          return Reflect.get(target, property, receiver)
        }
        return createAccessRecorder([...path, property])
      },
    },
  ) as AccessRecorder
}

type WriteInstruction = {
  fn: string
  offset: number
  valuePath: string[]
  endianness: boolean
}

/**
 * Mock BufferWriter which only records calls to `dataView`.
 */
class RecorderWriter extends BufferWriter {
  readonly instructions: WriteInstruction[] = []

  constructor(options?: ConstructorParameters<typeof BufferWriter>['1']) {
    super(new ArrayBuffer(), options)
    // @ts-expect-error
    this.dataView = new Proxy(
      {},
      {
        get: (target, property, receiver) => {
          if (typeof property === 'symbol') {
            return Reflect.get(target, property, receiver)
          }
          return (
            offset: number,
            value: AccessRecorder,
            endianness: boolean,
          ) => {
            this.instructions.push({
              fn: property,
              offset,
              valuePath: value[accessRecorderPath],
              endianness,
            })
          }
        },
      },
    )
  }
}

const outName = 'output'
const offsetName = 'offset'
const argName = 'value'

function formatArg(path: string[]) {
  const pathStr = path.map((p) => (isNaN(Number(p)) ? `.${p}` : `[${p}]`))
  return `${argName}${pathStr.join('')}`
}

export function compileWriterForSchema<T extends AnyData>(
  schema: T,
): (output: DataView, offset: number, value: Infer<T>) => void {
  const writer = new RecorderWriter()
  tgpu['~unstable'].writeData(writer, schema, createAccessRecorder() as any)
  const fnBody = writer.instructions
    .map(
      ({ fn, offset, valuePath, endianness }) =>
        `${outName}.${fn}(${offsetName}+${offset},${formatArg(valuePath)},${endianness});`,
    )
    .join('\n')
  return new Function(outName, offsetName, argName, fnBody) as any
}

function accessDeep(obj: {}, path: string[]) {
  for (let i = 0; i < path.length; ++i) {
    // @ts-expect-error
    obj = obj[path[i]]
  }
  return obj
}

export function createWriterForSchema<T extends AnyData>(
  schema: T,
): (output: DataView, offset: number, value: Infer<T>) => void {
  const writer = new RecorderWriter()
  tgpu['~unstable'].writeData(writer, schema, createAccessRecorder() as any)
  const { instructions } = writer
  return (output, offset_, value) => {
    for (const { fn, offset, valuePath, endianness } of instructions) {
      output[fn](offset_ + offset, accessDeep(value, valuePath), endianness)
    }
  }
}
