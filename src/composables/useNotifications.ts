import { readonly, ref } from 'vue'

export type NotificationType = 'success' | 'error' | 'info' | 'warning'

export interface NotificationPayload {
  type: NotificationType
  message: string
  duration?: number
}

export interface AppNotification extends NotificationPayload {
  id: number
}

const notifications = ref<AppNotification[]>([])
const timers = new Map<number, ReturnType<typeof setTimeout>>()
let nextId = 1

export function dismissNotification(id: number) {
  const timer = timers.get(id)
  if (timer) clearTimeout(timer)
  timers.delete(id)
  notifications.value = notifications.value.filter(item => item.id !== id)
}

export function notify(payload: NotificationPayload) {
  const id = nextId++
  notifications.value.push({ ...payload, id })
  while (notifications.value.length > 3) dismissNotification(notifications.value[0].id)

  const duration = payload.duration ?? (payload.type === 'error' ? 5000 : 3200)
  if (duration > 0) {
    timers.set(id, setTimeout(() => dismissNotification(id), duration))
  }
  return id
}

export const notifySuccess = (message: string, duration?: number) => notify({ type: 'success', message, duration })
export const notifyError = (message: string, duration?: number) => notify({ type: 'error', message, duration })

export function useNotifications() {
  return { notifications: readonly(notifications), dismissNotification }
}
