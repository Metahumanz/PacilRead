import { nextTick, type Ref } from 'vue'

interface PageFlipController {
  flipNext: () => boolean
  flipPrev: () => boolean
}

export function usePageFlipScheduler(pageFlipRef: Ref<PageFlipController | null>) {
  const scheduleOuterPageFlip = (
    direction: 1 | -1,
    prepare: Promise<unknown>,
    fallback?: () => boolean | void,
  ) => {
    prepare
      .then(() => {
        nextTick(() => {
          requestAnimationFrame(() => {
            const flipped = direction > 0
              ? pageFlipRef.value?.flipNext()
              : pageFlipRef.value?.flipPrev()
            if (!flipped) fallback?.()
          })
        })
      })
      .catch((error) => {
        console.error('Prepare outer page flip failed:', error)
        fallback?.()
      })
  }

  return {
    scheduleOuterPageFlip,
  }
}
