export function createPromiseCallbacks<T>() {
  let resolve: (value: T | PromiseLike<T>) => void
  let reject: (reason?: any) => void
  const promise = new Promise<T>((resolve_, reject_) => {
    resolve = resolve_
    reject = reject_
  })
  return { promise, resolve: resolve!, reject: reject! }
}
