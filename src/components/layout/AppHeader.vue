<script setup lang="ts">
import { computed, inject, ref } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import { storeToRefs } from 'pinia'
import { onClickOutside } from '@vueuse/core'
import HeaderMetaTicker from './HeaderMetaTicker.vue'
import SearchBar from '@/components/search/SearchBar.vue'
import { useUiStore } from '@/stores/ui'
import { apiFetch } from '@/utils/api'

const router = useRouter()
const ui = useUiStore()
const { theme } = storeToRefs(ui)
const persistTheme = inject<() => Promise<void>>('persistTheme')

const isHome = computed(() => router.currentRoute.value.path === '/')

function cycleThemeAndPersist() {
  ui.cycleTheme()
  persistTheme?.()
}

const themeIcon = computed(() => {
  if (theme.value === 'system') return 'brightness_auto'
  if (theme.value === 'light') return 'light_mode'
  return 'dark_mode'
})

const themeTitle = computed(() => {
  if (theme.value === 'system') return '主题：跟随系统（点击切换）'
  if (theme.value === 'light') return '主题：浅色（点击切换）'
  return '主题：深色（点击切换）'
})

const overflowOpen = ref(false)
const overflowRef = ref<HTMLElement | null>(null)
const overflowTriggerRef = ref<HTMLElement | null>(null)
function closeOverflow() {
  overflowOpen.value = false
}
onClickOutside(overflowRef, closeOverflow, { ignore: [overflowTriggerRef] })

const mobileSearchOpen = ref(false)
function openMobileSearch() {
  mobileSearchOpen.value = true
}
function closeMobileSearch() {
  mobileSearchOpen.value = false
}

async function logout() {
  await apiFetch('/api/auth/logout', { method: 'POST' })
  router.push('/login')
}

function openQuickAdd() {
  ui.setQuickAddModalOpen(true)
  if (router.currentRoute.value.path !== '/') router.push('/')
}
</script>

<template>
  <header class="header shrink-0 sticky z-50 mx-2 sm:mx-4 md:mx-6 mt-2 sm:mt-4" style="top: max(0.5rem, env(safe-area-inset-top));">
    <div class="h-12 sm:h-14 md:h-16 px-3 sm:px-4 md:px-5 flex items-center gap-2 rounded-2xl glass-translucent shadow-lg min-w-0">
      <div class="header-left flex items-center gap-3 md:gap-4 shrink-0 min-w-0">
        <RouterLink
          to="/"
          class="flex items-center gap-2.5 shrink-0 rounded-xl py-1.5 -ml-1 transition-opacity hover:opacity-90 text-indigo-600 dark:text-indigo-300"
          aria-label="OmniNav 首页"
        >
          <img src="/logo.svg" alt="OmniNav" class="size-9 rounded-xl shadow-lg" />
          <span class="text-slate-800 dark-text-94 text-lg font-bold leading-tight tracking-tight hidden sm:inline">OmniNav</span>
        </RouterLink>
        <div class="hidden md:flex items-center">
          <HeaderMetaTicker />
        </div>
      </div>

      <div v-if="isHome" class="header-center flex-1 min-w-0 px-1 sm:px-2 md:px-2 lg:px-4">
        <div class="w-full min-w-0 max-w-2xl mx-auto">
          <div class="hidden sm:block">
            <SearchBar full-width />
          </div>
          <div class="sm:hidden flex justify-center">
            <button
              type="button"
              class="h-9 w-9 rounded-xl flex items-center justify-center transition-colors cursor-pointer glass-translucent border border-slate-200/60 dark:border-white/20 text-slate-600 dark:text-white/80 hover:bg-slate-200/50 dark:hover:bg-white/10 shrink-0"
              title="搜索"
              aria-label="搜索"
              @click="openMobileSearch"
            >
              <span class="material-symbols-outlined text-[22px]">search</span>
            </button>
          </div>
        </div>
      </div>

      <div class="header-right flex items-center shrink-0 ml-auto">
        <!-- 拖动开关：带左右垂直分隔线 -->
        <div class="hidden lg:flex items-center mr-1">
          <button
            type="button"
            class="h-9 w-9 md:h-10 md:w-10 rounded-xl flex items-center justify-center transition-colors cursor-pointer glass-translucent border border-slate-200/60 dark:border-white/20 text-slate-600 dark:text-white/80 hover:bg-slate-200/50 dark:hover:bg-white/10 shrink-0 select-none"
            :title="ui.isEditLayout ? '已开启：拖拽卡片可调整顺序' : '点击开启后，拖拽可调整书签顺序'"
            :aria-pressed="ui.isEditLayout"
            :class="
              ui.isEditLayout
                ? 'border-primary bg-primary/5 text-primary hover:bg-primary/10 dark:hover:bg-primary/10'
                : ''
            "
            @click="ui.isEditLayout = !ui.isEditLayout"
          >
            <span class="material-symbols-outlined" aria-hidden="true">
              {{ ui.isEditLayout ? 'lock_open' : 'lock' }}
            </span>
          </button>
        </div>

        <div class="flex items-center gap-2 ml-1">
          <button
            type="button"
            class="hidden lg:flex h-9 w-9 md:h-10 md:w-10 rounded-xl items-center justify-center transition-colors cursor-pointer glass-translucent border border-slate-200/60 dark:border-white/20 text-slate-600 dark:text-white/80 hover:bg-slate-200/50 dark:hover:bg-white/10 shrink-0"
            :title="themeTitle"
            :aria-label="themeTitle"
            @click="cycleThemeAndPersist"
          >
            <span class="material-symbols-outlined text-[22px]">{{ themeIcon }}</span>
          </button>
          <button
            type="button"
            class="hidden lg:flex h-9 w-9 md:h-10 md:w-10 rounded-xl items-center justify-center transition-colors cursor-pointer shrink-0 bg-indigo-500 dark:bg-indigo-400 text-white hover:bg-indigo-600 dark:hover:bg-indigo-300 active:scale-[0.98]"
            title="快速添加"
            aria-label="快速添加"
            @click="openQuickAdd"
          >
            <span class="material-symbols-outlined text-[22px]">add_link</span>
          </button>
          <button
            type="button"
            class="hidden lg:flex h-9 w-9 md:h-10 md:w-10 rounded-xl items-center justify-center transition-colors cursor-pointer shrink-0 bg-indigo-500 dark:bg-indigo-400 text-white hover:bg-indigo-600 dark:hover:bg-indigo-300 active:scale-[0.98]"
            title="AI 对话"
            aria-label="AI 对话"
            @click="ui.toggleDrawer()"
          >
            <span class="material-symbols-outlined text-[22px]">auto_awesome</span>
          </button>
          <RouterLink
            to="/settings"
            class="hidden sm:flex h-9 w-9 md:h-10 md:w-10 rounded-xl items-center justify-center glass-translucent border border-slate-200/60 dark:border-white/20 text-slate-600 dark:text-white/80 hover:bg-slate-200/50 dark:hover:bg-white/10 transition-colors cursor-pointer shrink-0"
            aria-label="设置"
          >
            <span class="material-symbols-outlined text-[22px]">settings</span>
          </RouterLink>
          <button
            type="button"
            class="hidden lg:flex h-9 w-9 md:h-10 md:w-10 rounded-xl items-center justify-center glass-translucent border border-slate-200/60 dark:border-white/20 text-slate-600 dark:text-white/80 hover:bg-slate-200/50 dark:hover:bg-white/10 transition-colors cursor-pointer shrink-0"
            title="退出登录"
            aria-label="退出登录"
            @click="logout"
          >
            <span class="material-symbols-outlined text-[22px]">logout</span>
          </button>

          <div class="relative lg:hidden" ref="overflowRef">
            <button
              ref="overflowTriggerRef"
              type="button"
              class="h-9 w-9 md:h-10 md:w-10 rounded-xl flex items-center justify-center glass-translucent border border-slate-200/60 dark:border-white/20 text-slate-600 dark:text-white/80 hover:bg-slate-200/50 dark:hover:bg-white/10 transition-colors cursor-pointer shrink-0"
              title="更多"
              aria-label="更多"
              aria-haspopup="menu"
              :aria-expanded="overflowOpen"
              @click="overflowOpen = !overflowOpen"
            >
              <span class="material-symbols-outlined text-[22px]">more_horiz</span>
            </button>
            <Transition name="menu-pop">
              <div
                v-if="overflowOpen"
                class="absolute right-0 top-full mt-2 w-48 rounded-2xl shadow-xl border border-slate-200 dark:border-white/20 bg-white dark:bg-slate-800/95 dark:backdrop-blur-xl z-[120] overflow-hidden"
                role="menu"
              >
                <button
                  type="button"
                  class="w-full px-4 py-3 text-left text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-200/50 dark:hover:bg-white/10 transition-colors cursor-pointer"
                  role="menuitem"
                  @click="closeOverflow(); cycleThemeAndPersist()"
                >
                  主题：{{ themeTitle.replace('主题：', '').replace('（点击切换）', '') }}
                </button>
                <button
                  type="button"
                  class="w-full px-4 py-3 text-left text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-200/50 dark:hover:bg-white/10 transition-colors cursor-pointer"
                  role="menuitem"
                  @click="closeOverflow(); openQuickAdd()"
                >
                  快速添加
                </button>
                <button
                  type="button"
                  class="w-full px-4 py-3 text-left text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-200/50 dark:hover:bg-white/10 transition-colors cursor-pointer"
                  role="menuitem"
                  @click="closeOverflow(); ui.toggleDrawer()"
                >
                  AI 对话
                </button>
                <RouterLink
                  to="/settings"
                  class="block w-full px-4 py-3 text-left text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-200/50 dark:hover:bg-white/10 transition-colors cursor-pointer"
                  role="menuitem"
                  @click="closeOverflow()"
                >
                  设置
                </RouterLink>
                <div class="border-t border-slate-200 dark:border-white/10" />
                <button
                  type="button"
                  class="w-full px-4 py-3 text-left text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-200/50 dark:hover:bg-white/10 transition-colors cursor-pointer"
                  role="menuitem"
                  @click="closeOverflow(); logout()"
                >
                  退出登录
                </button>
              </div>
            </Transition>
          </div>
        </div>
      </div>
    </div>
  </header>

  <Teleport to="body">
    <Transition name="modal-fade">
      <div
        v-if="mobileSearchOpen"
        class="fixed inset-0 z-[140] flex items-start justify-center p-4 bg-black/30 dark:bg-black/50 backdrop-blur-sm modal-fade-overlay"
        @click.self="closeMobileSearch"
      >
        <div
          class="w-full max-w-2xl rounded-2xl shadow-2xl border border-slate-200 dark:border-white/20 bg-white/95 dark:bg-white/5 backdrop-blur-xl overflow-visible"
          @click.stop
        >
          <div class="px-4 py-3 border-b border-slate-200 dark:border-white/10 flex items-center justify-between">
            <span class="font-semibold text-slate-800 dark-text-94">搜索</span>
            <button
              type="button"
              class="p-2 rounded-lg hover:bg-slate-200/50 dark:hover:bg-white/10 text-slate-500 dark-text-94 transition-colors"
              aria-label="关闭"
              @click="closeMobileSearch"
            >
              <span class="material-symbols-outlined">close</span>
            </button>
          </div>
          <div class="p-4">
            <SearchBar full-width auto-focus />
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>
