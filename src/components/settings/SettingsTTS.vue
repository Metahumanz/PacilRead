<script setup lang="ts">
import { useSettings } from '../../composables/useSettings'

const { saveMiMoKey } = defineProps<{
  saveMiMoKey: () => void
}>()

const settings = useSettings()
const { ttsMiMoApiKey } = settings
</script>

<template>
  <div class="mb-8">
    <h3 class="text-[14px] font-semibold text-slate-700 dark:text-white/80 mb-3 px-1">语音朗读</h3>
    <div class="bg-white dark:bg-[#2d2d2d] rounded-xl border border-black/5 dark:border-white/[0.06] shadow-sm hover:shadow-lg hover:-translate-y-1 transition-all duration-400 divide-y divide-white/[0.04]">
      <div class="p-4 hover:bg-black/[0.02] dark:hover:bg-white/[0.01] transition-colors">
        <div class="flex items-start gap-4">
          <span class="text-xl opacity-80 mt-0.5">🎙️</span>
          <div class="flex-1">
            <div class="text-[14px] font-medium text-slate-800 dark:text-white/90">小米 MiMo TTS 配置</div>
            <div class="text-[12px] text-slate-500 dark:text-white/50 mt-0.5 mb-3">填写您的 API Key 以启用小米流式语音合成功能</div>
            <div class="bg-black/10 p-4 rounded-lg border border-black/5 dark:border-white/5">
              <label class="block text-[11px] text-slate-500 dark:text-white/50 mb-1">API Key</label>
              <div class="flex gap-2">
                <input type="password" v-model="ttsMiMoApiKey" @change="saveMiMoKey" placeholder="在此输入您的 API Key..." class="flex-1 bg-black/30 border border-black/10 dark:border-white/10 rounded-md px-3 py-1.5 text-[12px] focus:border-[#005fb8] outline-none transition-colors" />
                <a href="https://platform.xiaomimimo.com/#/console/api-keys" target="_blank" class="px-3 py-1.5 bg-black/5 dark:bg-white/10 hover:bg-white/20 text-white rounded-md text-[11px] transition-colors flex items-center border border-black/5 dark:border-white/5">获取 Key</a>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
