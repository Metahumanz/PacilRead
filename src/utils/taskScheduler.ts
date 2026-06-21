export interface ScheduledTask {
  schedule: () => void
  flush: () => void
  cancel: () => void
}

export function createThrottledTask(task: () => void, waitMs: number): ScheduledTask {
  let timer: ReturnType<typeof setTimeout> | null = null
  let lastRun = 0

  const run = () => {
    if (timer) clearTimeout(timer)
    timer = null
    lastRun = Date.now()
    task()
  }

  return {
    schedule() {
      const remaining = waitMs - (Date.now() - lastRun)
      if (remaining <= 0) run()
      else if (!timer) timer = setTimeout(run, remaining)
    },
    flush() {
      if (timer) run()
    },
    cancel() {
      if (timer) clearTimeout(timer)
      timer = null
    },
  }
}
