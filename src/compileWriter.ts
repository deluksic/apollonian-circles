import { AnyData, Infer, sizeOf } from 'typegpu/data'
import { PathElement, RecipeSymbol, traceRecipe } from './traceRecipe'

type WriteProps = {
  type: 'f32' | 'u32'
  offset: number
}

function offsetsOf(schema: AnyData, path: string[], offset = 0): WriteProps {
  const [property, ...restPath] = path
  if (schema.type === 'struct') {
    for (const [schemaProp, data] of Object.entries(schema.propTypes)) {
      if (schemaProp === property) {
        return offsetsOf(data, restPath, offset)
      }
      offset += sizeOf(data)
    }
    throw new Error(`Unknown struct field ${property}`)
  }
  if (schema.type === 'vec2f') {
    if (property === 'x') {
      return { type: 'f32', offset }
    }
    if (property === 'y') {
      return { type: 'f32', offset: offset + 4 }
    }
    throw new Error(`Unknown vector field ${property}`)
  }
  if (schema.type === 'u32') {
    return { type: 'u32', offset }
  }
  if (schema.type === 'f32') {
    return { type: 'f32', offset }
  }
  throw new Error(`Unsupported schema type ${schema.type}`)
}

export function compileWriter<TData extends AnyData, TArgs extends unknown[]>(
  Schema: TData,
  recipe: (draft: Infer<TData>, ...args: TArgs) => void,
): (target: DataView, ...args: TArgs) => void {
  const setters = []

  function recipeSymbolToString(symbol: number | RecipeSymbol) {
    if (typeof symbol === 'number') {
      return String(symbol)
    }
    const pathString = symbol.path.map(pathElementToString).join('')
    if (symbol.type === 'arg') {
      return `arg${symbol.index}${pathString}`
    }
    if (symbol.type === 'draft') {
      const { offset, type } = offsetsOf(Schema, symbol.path)
      if (type === 'f32') {
        const getter = `target.getFloat32(${offset}, true)`
        return getter
      }
      if (type === 'u32') {
        const getter = `target.getUint32(${offset}, true)`
        return getter
      }
      throw new Error(`Unsupported type ${type}`)
    }
    throw new Error(`Unreachable code reached.`)
  }

  function pathElementToString(pathElement: PathElement): string {
    if (typeof pathElement === 'string') {
      return `.${pathElement}`
    }
    return `[${recipeSymbolToString(pathElement)}]`
  }

  const cmds = traceRecipe(recipe)
  for (const cmd of cmds) {
    const { offset, type } = offsetsOf(Schema, cmd.path)
    const value = recipeSymbolToString(cmd.value)
    if (type === 'f32') {
      setters.push(`target.setFloat32(${offset}, ${value}, true);`)
      continue
    }
    if (type === 'u32') {
      setters.push(`target.setUint32(${offset}, ${value}, true);`)
      continue
    }
    throw new Error(`Unsupported type ${type}`)
  }
  return new Function(
    'target',
    ...Array.from({ length: recipe.length - 1 }).map((_, i) => `arg${i}`),
    setters.join('\n'),
  ) as (target: DataView, ...args: TArgs) => void
}
