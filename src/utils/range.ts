export function range(n: number) {
  const result = new Array(n)
  for (let i = 0; i < n; ++i) {
    result[i] = i
  }
  return result
}
