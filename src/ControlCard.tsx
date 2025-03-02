import { ParentProps } from 'solid-js'
import ui from './ControlCard.module.css'

export function Card(props: ParentProps) {
  return (
    <div class={ui.container}>
      <div class={ui.content}>{props.children}</div>
    </div>
  )
}
