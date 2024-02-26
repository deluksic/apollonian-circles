import { createSignal } from 'solid-js'
import { createStore } from 'solid-js/store'

export const [circles, setCircles] = createStore<Circle[]>([])
export const [debug, setDebug] = createSignal(false)
