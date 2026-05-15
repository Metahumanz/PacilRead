const isPerfEnabled = () => {
  try {
    return import.meta.env.DEV || window.localStorage.getItem('pacilread:perf') === '1'
  } catch (_) {
    return import.meta.env.DEV
  }
}

export function perfNow(): number {
  return performance.now()
}

export function perfLog(label: string, startedAt: number, extra = ''): void {
  if (!isPerfEnabled()) return
  const elapsed = Math.round((performance.now() - startedAt) * 10) / 10
  console.log(`[Perf] ${label}: ${elapsed}ms${extra ? ` ${extra}` : ''}`)
}
