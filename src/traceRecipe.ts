type DraftSymbol = { type: 'draft'; path: Path }
type ArgSymbol = { type: 'arg'; index: number; path: Path }
export type RecipeSymbol = DraftSymbol | ArgSymbol
export type PathElement = string | number | RecipeSymbol
type Path = PathElement[]

export type SetCommand = {
  path: Path
  value: number | RecipeSymbol
}

function parseRecipeSymbolString(
  value: string,
): number | string | RecipeSymbol {
  const argMatch = value.match(/^arg:(?<index>\d+)(\[(?<path>.*)\])?$/)
  if (argMatch?.groups?.index) {
    const index = parseInt(argMatch.groups.index)
    const path = argMatch.groups.path
      ? argMatch.groups.path.split(',').map(parseRecipeSymbolString)
      : []
    return { type: 'arg', index, path }
  }
  const draftMatch = value.match(/^draft:\[(?<path>.*)\]$/)
  if (draftMatch?.groups?.path) {
    const path = draftMatch.groups.path.split(',').map(parseRecipeSymbolString)
    return { type: 'draft', path }
  }
  const valueAsNumber = Number(value)
  if (!isNaN(valueAsNumber)) {
    return valueAsNumber
  }
  return value
}

function createDraftSpy(path: string[], output: SetCommand[]) {
  return new Proxy(
    {},
    {
      get(target, property, receiver) {
        if (property === 'toString') {
          return () => `draft:[${path.join(',')}]`
        }
        if (typeof property === 'symbol') {
          return Reflect.get(target, property, receiver)
        }
        return createDraftSpy([...path, property], output)
      },
      set(target, property, value, receiver) {
        if (typeof property === 'symbol') {
          return Reflect.set(target, property, value, receiver)
        }
        const parsedValue = parseRecipeSymbolString(String(value))
        if (typeof parsedValue === 'string') {
          throw new Error(`Can't assign string as value`)
        }
        output.push({
          path: [...path, property].map(parseRecipeSymbolString),
          value: parsedValue,
        })
        return true
      },
    },
  )
}

function createArgSpy(index: number, path: string[]) {
  return new Proxy(
    {},
    {
      get(target, property, receiver) {
        if (property === 'toString') {
          return () =>
            path.length > 0 ? `arg:${index}[${path.join(',')}]` : `arg:${index}`
        }
        if (typeof property === 'symbol') {
          return Reflect.get(target, property, receiver)
        }
        return createArgSpy(index, [...path, property])
      },
    },
  )
}

export function traceRecipe(
  recipe: (draft: any, ...args: any[]) => void,
): SetCommand[] {
  const output: SetCommand[] = []
  const draft = createDraftSpy([], output)
  const args = Array.from({ length: recipe.length - 1 }).map((_, i) =>
    createArgSpy(i, []),
  )
  recipe(draft, ...args)
  return output
}
