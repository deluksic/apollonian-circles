import { FlameFunction } from '../flameFunction'
import { empty } from './empty'
import { example1 } from './example1'

export const examples = { example1, empty } satisfies Record<
  string,
  FlameFunction[]
>
export type ExampleID = keyof typeof examples
