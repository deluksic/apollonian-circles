export function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export function nextAnimationFrame() {
  return new Promise((resolve) => requestAnimationFrame(resolve))
}

export function createPromiseCallbacks<T>() {
  let resolve: (value: T | PromiseLike<T>) => void
  let reject: (reason?: any) => void
  const promise = new Promise<T>((resolve_, reject_) => {
    resolve = resolve_
    reject = reject_
  })
  return { promise, resolve: resolve!, reject: reject! }
}

export function range(exclusiveEnd: number) {
  const res = new Array(exclusiveEnd)
  for (let i = 0; i < exclusiveEnd; ++i) {
    res[i] = i
  }
  return res
}

export function lerp(e0: number, e1: number, t: number) {
  return e0 + (e1 - e0) * t
}

export function isDefined<T>(x: T | undefined): x is T {
  return x !== undefined
}
