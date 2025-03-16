import { FlameFunction } from '../flameFunction'
import { empty } from './empty'
import { example1 } from './example1'
import { var_test } from '@/flame/examples/var_test'
import { single_var } from '@/flame/examples/single_var'

export const examples = { var_test, example1, empty, single_var } satisfies Record<
  string,
  FlameFunction[]
>
export type ExampleID = keyof typeof examples
