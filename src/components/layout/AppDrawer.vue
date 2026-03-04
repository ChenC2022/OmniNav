<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { useUiStore } from '@/stores/ui'
import { onClickOutside } from '@vueuse/core'
import { ref } from 'vue'
import ChatPanel from '@/components/chat/ChatPanel.vue'

const ui = useUiStore()
const { drawerOpen } = storeToRefs(ui)
const drawerEl = ref<HTMLElement | null>(null)

onClickOutside(drawerEl, () => {
  if (drawerOpen.value) ui.toggleDrawer()
})
</script>

<template>
  <Teleport to="body">
    <Transition name="drawer">
      <aside
        v-show="drawerOpen"
        ref="drawerEl"
        class="drawer drawer-panel fixed top-0 right-0 h-full w-full sm:w-[400px] max-w-[100vw] bg-white dark:bg-slate-900 border-l border-slate-200 dark:border-slate-800 shadow-2xl z-50 flex flex-col"
        aria-label="AI 对话侧边栏"
      >
        <div class="drawer-panel-header p-4 sm:p-6 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <div class="flex items-center gap-3">
            <div class="w-8 h-8 rounded-lg bg-indigo-500/20 flex items-center justify-center text-indigo-500 dark:text-indigo-400">
              <span class="material-symbols-outlined text-lg">auto_awesome</span>
            </div>
            <h2 class="font-bold text-slate-900 dark:text-white drawer-panel-title">AI 对话</h2>
          </div>
          <button
            type="button"
            class="drawer-panel-close p-2 rounded-xl opacity-60 hover:opacity-100 text-slate-600 dark:text-slate-400 hover:bg-slate-200/50 dark:hover:bg-white/10 transition-all"
            aria-label="关闭"
            @click="ui.toggleDrawer()"
          >
            <span class="material-symbols-outlined">close</span>
          </button>
        </div>
        <div class="flex-1 min-h-0 overflow-hidden flex flex-col chat-panel-wrap">
          <ChatPanel @close="ui.toggleDrawer()" />
        </div>
      </aside>
    </Transition>
    <Transition name="backdrop">
      <div
        v-show="drawerOpen"
        class="fixed inset-0 bg-black/30 z-40"
        aria-hidden="true"
        @click="ui.toggleDrawer()"
      />
    </Transition>
  </Teleport>
</template>

<style scoped>
.drawer-enter-active,
.drawer-leave-active {
  transition: transform 0.28s cubic-bezier(0.32, 0.72, 0, 1);
}
.drawer-enter-from,
.drawer-leave-to {
  transform: translateX(100%);
}
.backdrop-enter-active,
.backdrop-leave-active {
  transition: opacity 0.22s ease-out;
}
.backdrop-enter-from,
.backdrop-leave-to {
  opacity: 0;
}
</style>
