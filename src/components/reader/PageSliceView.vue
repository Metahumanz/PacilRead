<script setup lang="ts">
import type { CSSProperties } from 'vue'
import type { PageLine, PageSlice } from '../../types/pagination'

const props = defineProps<{
  slice: PageSlice
  justify?: boolean
}>()

const lineStyle = (line: PageLine, index: number): CSSProperties => ({
  height: `${line.height}px`,
  lineHeight: `${line.height}px`,
  marginTop: index > 0 ? `${props.slice.extraLineGap}px` : '0px',
  marginBottom: line.afterSpacing > 0 ? `${line.afterSpacing}px` : '0px',
  textIndent: line.indentPx > 0 ? `${line.indentPx}px` : '0px',
  textAlign: line.textAlign as CSSProperties['textAlign'],
})
</script>

<template>
  <div class="page-slice" :data-page-index="slice.pageIndex">
    <div
      v-for="(line, index) in slice.lines"
      :key="line.key"
      class="page-line"
      :data-line-index="index"
      :data-line-kind="line.kind"
      :data-body-start="line.bodyStart"
      :data-body-end="line.bodyEnd"
      :class="[
        line.kind === 'title' ? 'page-line-title' : 'page-line-body',
        props.justify && line.kind === 'body' && !line.isParagraphEnd ? 'page-line-justify' : '',
      ]"
      :style="lineStyle(line, index)"
    >
      {{ line.text }}
    </div>
  </div>
</template>

<style scoped>
.page-slice {
  width: var(--reader-content-column-width);
  height: var(--reader-page-grid-height);
  overflow: hidden;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
}

.page-line {
  width: 100%;
  box-sizing: border-box;
  overflow: hidden;
  white-space: pre;
  letter-spacing: inherit;
  color: inherit;
  flex: 0 0 auto;
}

.page-line-title {
  font-size: 1.4em;
  font-weight: 700;
  opacity: 0.85;
}

.page-line-body {
  font-size: 1em;
  font-weight: inherit;
}

.page-line-justify {
  text-align: justify;
  text-align-last: justify;
  text-justify: inter-character;
}

.page-line-justify::after {
  content: "";
  display: inline-block;
  width: 100%;
}
</style>
