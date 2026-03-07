<script setup lang="ts">
import { computed, inject, nextTick, ref, watch, onMounted, onUnmounted } from 'vue'
import { onClickOutside } from '@vueuse/core'
import draggable from 'vuedraggable'
import type { Bookmark } from '@/types'
import type { Category } from '@/types'
import { useBookmarksStore } from '@/stores/bookmarks'
import { usePinnedStore } from '@/stores/pinned'
import { usePrivateCategoriesStore } from '@/stores/privateCategories'
import { hashPassword } from '@/utils/crypto'
import BookmarkIcon from '@/components/bookmark/BookmarkIcon.vue'
import BookmarkForm from '@/components/bookmark/BookmarkForm.vue'

const props = withDefaults(
  defineProps<{
    category: Category
    /** 是否允许拖拽（含跨分类），由首页「编辑布局」控制 */
    editLayout?: boolean
    /** 为 true 时不显示卡片内分类名（如独立区域「未分类」已有 section 标题时使用） */
    hideTitle?: boolean
    /** 为 true 时添加按钮由 section 头部提供，卡片内不显示 Add 格子（与 hideTitle 搭配） */
    addInHeader?: boolean
    /** 为 true 时不显示重命名、删除（如「未分类」不可改名、不可删） */
    noRenameDelete?: boolean
    /** 为 true 时不显示卡片内「添加」格子（仅用头部添加按钮时使用，如未分类） */
    noAddInGrid?: boolean
    /** 最小折叠级别（默认 0），未分类应设为 1 以跳过「仅标题」态 */
    minViewLevel?: number
  }>(),
  { editLayout: true, hideTitle: false, addInHeader: false, noRenameDelete: false, noAddInGrid: false, minViewLevel: 0 }
)

const emit = defineEmits<{
  (e: 'editCategory'): void
  (e: 'deleteCategory'): void
}>()

import { useCategoriesStore } from '@/stores/categories'
const bookmarksStore = useBookmarksStore()
const categoriesStore = useCategoriesStore()
const saveBookmarks = inject<() => Promise<void>>('saveBookmarks')
const saveCategories = inject<() => Promise<void>>('saveCategories')
const savePinned = inject<() => Promise<void>>('savePinned')
const runCheckAndCleanupForCategory = inject<(categoryId: string) => void>('runCheckAndCleanupForCategory')
const uncategorizedCategoryId = inject<import('vue').ComputedRef<string | null> | null>('uncategorizedCategoryId')
const pinnedStore = usePinnedStore()
const privateStore = usePrivateCategoriesStore()

const showContent = computed(() => !props.category.isPrivate || privateStore.isUnlocked(props.category.id))
const unlockPassword = ref('')
const unlockError = ref('')
const unlockLoading = ref(false)

async function unlock() {
  const pwd = unlockPassword.value.trim()
  if (!pwd || !props.category.passwordHash) return
  unlockError.value = ''
  unlockLoading.value = true
  try {
    const hash = await hashPassword(props.category.id, pwd)
    if (hash === props.category.passwordHash) {
      privateStore.unlock(props.category.id)
      unlockPassword.value = ''
    } else {
      unlockError.value = '密码错误'
    }
  } finally {
    unlockLoading.value = false
  }
}

const bookmarksInCategory = computed(() =>
  bookmarksStore.items
    .filter((b) => b.categoryId === props.category.id)
    .sort((a, b) => a.order - b.order)
)

/** 允许删除分类（删除时书签会移入未分类，不再因常用书签而禁止） */
const canDeleteCategory = true

const list = ref<Bookmark[]>([])
watch(bookmarksInCategory, (v) => { list.value = [...v] }, { immediate: true })

const formOpen = ref(false)
const editingBookmark = ref<Bookmark | null>(null)

function openAdd() {
  editingBookmark.value = null
  formOpen.value = true
}
function openEdit(b: Bookmark) {
  editingBookmark.value = b
  formOpen.value = true
}

function onSaveBookmark(b: Bookmark) {
  if (editingBookmark.value) {
    bookmarksStore.updateBookmark(b.id, b)
  } else {
    bookmarksStore.addBookmark({ ...b, order: list.value.length })
  }
  saveBookmarks?.()
  formOpen.value = false
  editingBookmark.value = null
}

function onDeleteBookmark(id: string) {
  bookmarksStore.removeBookmark(id)
  saveBookmarks?.()
}

const viewLevel = computed(() => {
  const raw = props.category.viewLevel ?? 1
  return Math.max(raw, props.minViewLevel)
})

const viewLevelIcon = computed(() => {
  const level = viewLevel.value
  if (level === 0) return 'expand_more'
  if (level === 1) return 'expand_content'
  if (level === 2) return 'unfold_more'
  return 'expand_less'
})

const viewLevelTitle = computed(() => {
  const level = viewLevel.value
  if (level === 0) return '第一层级：仅标题'
  if (level === 1) return '第二层级：显示 3 行'
  if (level === 2) return '第三层级：显示 10 行'
  return '第四层级：全部展开'
})

function toggleViewLevel() {
  const current = viewLevel.value
  let next = (current + 1) % 4
  if (next < props.minViewLevel) next = props.minViewLevel
  categoriesStore.updateCategory(props.category.id, { viewLevel: next })
  saveCategories?.()
}

function onDragEnd() {
  list.value.forEach((b, i) => bookmarksStore.updateBookmark(b.id, { order: i }))
  saveBookmarks?.()
}

/** 跨分类拖入：将当前 list 中所有书签归属到本分类并重排 order；拖出到另一分类后从 store 恢复 list */
function onListChange(evt: { added?: { element: Bookmark; newIndex: number }; removed?: { element: Bookmark; oldIndex: number } }) {
  if (evt.added) {
    list.value.forEach((b, i) => bookmarksStore.updateBookmark(b.id, { categoryId: props.category.id, order: i }))
    saveBookmarks?.()
  }
  if (evt.removed) {
    list.value.forEach((b, i) => bookmarksStore.updateBookmark(b.id, { order: i }))
    saveBookmarks?.()
    nextTick(() => { list.value = [...bookmarksInCategory.value] })
  }
}

// 右键上下文菜单（未分类等底部区域时向上展开，避免被裁切）
const CONTEXT_MENU_ESTIMATE_HEIGHT = 240
const contextMenuOpen = ref(false)
const contextMenuPos = ref<{ x: number; y: number; openUpward?: boolean; bottom?: number }>({ x: 0, y: 0 })
const contextMenuBookmark = ref<Bookmark | null>(null)
const contextMenuRef = ref<HTMLElement | null>(null)

function openContextMenu(e: MouseEvent, bookmark: Bookmark) {
  e.preventDefault()
  contextMenuBookmark.value = bookmark
  const x = e.clientX
  const y = e.clientY
  const openUpward = y + CONTEXT_MENU_ESTIMATE_HEIGHT > window.innerHeight
  contextMenuPos.value = openUpward
    ? { x, y, openUpward: true, bottom: window.innerHeight - y + 6 }
    : { x, y }
  contextMenuOpen.value = true
}

const contextMenuStyle = computed(() => {
  const pos = contextMenuPos.value
  if (pos.openUpward && pos.bottom != null) {
    return { left: `${pos.x}px`, bottom: `${pos.bottom}px` }
  }
  return { left: `${pos.x}px`, top: `${pos.y}px` }
})

function closeContextMenu() {
  contextMenuOpen.value = false
  contextMenuBookmark.value = null
}

function openInNewWindow(bookmark: Bookmark) {
  if (bookmark?.url) window.open(bookmark.url, '_blank', 'noopener,noreferrer')
  closeContextMenu()
}

function handleContextEdit(bookmark: Bookmark) {
  openEdit(bookmark)
  closeContextMenu()
}

function handleContextDelete(bookmark: Bookmark) {
  onDeleteBookmark(bookmark.id)
  closeContextMenu()
}

async function handleContextTogglePinned(bookmark: Bookmark) {
  pinnedStore.toggle(bookmark.id)
  await savePinned?.()
  closeContextMenu()
}

/** 移入未分类：仅当存在未分类且当前不是未分类时可用 */
const showMoveToUncategorized = computed(() => {
  const id = uncategorizedCategoryId?.value ?? null
  return id != null && id !== props.category.id
})
function handleContextMoveToUncategorized(bookmark: Bookmark) {
  const targetId = uncategorizedCategoryId?.value ?? null
  if (targetId && bookmark?.id) {
    const order = bookmarksStore.items.filter((b) => b.categoryId === targetId).length
    bookmarksStore.updateBookmark(bookmark.id, { categoryId: targetId, order })
    saveBookmarks?.()
  }
  closeContextMenu()
}

onClickOutside(contextMenuRef, closeContextMenu)

// 分类设置菜单（检测+清理/编辑/删除）；Teleport 到 body 避免被卡片 overflow 裁剪
const settingsMenuOpen = ref(false)
const settingsMenuRef = ref<HTMLElement | null>(null)
const settingsTriggerRef = ref<HTMLElement | null>(null)
const settingsMenuPos = ref({ top: 0, left: 0 })
onClickOutside(settingsMenuRef, closeSettingsMenu, { ignore: [settingsTriggerRef] })

function toggleSettingsMenu() {
  if (settingsMenuOpen.value) {
    settingsMenuOpen.value = false
    return
  }
  settingsMenuOpen.value = true
  nextTick(() => {
    const el = settingsTriggerRef.value
    if (el) {
      const rect = el.getBoundingClientRect()
      settingsMenuPos.value = { top: rect.bottom + 4, right: window.innerWidth - rect.right }
    }
  })
}
function closeSettingsMenu() {
  settingsMenuOpen.value = false
}

/** 点击分类名打开「该分类下全部书签」浮层；私密且未解锁时不可点击 */
const canOpenBookmarksOverlay = computed(() => showContent.value)
const bookmarksOverlayOpen = ref(false)
function openBookmarksOverlay() {
  if (canOpenBookmarksOverlay.value) bookmarksOverlayOpen.value = true
}
function closeBookmarksOverlay() {
  bookmarksOverlayOpen.value = false
}

function onCheckAndCleanupClick() {
  closeSettingsMenu()
  runCheckAndCleanupForCategory?.(props.category.id)
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    closeContextMenu()
    settingsMenuOpen.value = false
  }
}
onMounted(() => window.addEventListener('keydown', onKeydown))
onUnmounted(() => window.removeEventListener('keydown', onKeydown))

defineExpose({ openAdd })
</script>

<template>
  <div
    class="group card-root glass-translucent rounded-2xl p-2 relative overflow-hidden"
  >
    <template v-if="!showContent">
      <div class="absolute inset-0 bg-slate-900/40 dark:bg-slate-950/60 backdrop-blur-md z-10 flex flex-col items-center justify-center p-6 text-center">
        <span class="material-symbols-outlined text-4xl mb-4 text-indigo-400">lock</span>
        <h3 class="font-bold mb-2 text-slate-900 dark:text-white">保险库已锁定</h3>
        <p class="text-xs text-slate-500 dark:text-white/90 mb-6">输入主密码访问私密链接</p>
        <div class="w-full max-w-[220px] space-y-3">
          <input
            v-model="unlockPassword"
            type="password"
            autocomplete="off"
            class="vault-input w-full rounded-xl px-4 py-2.5 text-sm transition-all"
            placeholder="••••••••"
            @keydown.enter="unlock()"
          />
          <button
            type="button"
            class="vault-btn w-full py-2.5 rounded-xl text-xs font-bold text-white transition-colors disabled:opacity-50"
            :disabled="unlockLoading || !unlockPassword.trim()"
            @click="unlock()"
          >
            {{ unlockLoading ? '验证中…' : '解锁' }}
          </button>
        </div>
        <p v-if="category.passwordHint" class="mt-4 text-[10px] text-slate-400 dark:text-white/70 uppercase tracking-tighter">提示：{{ category.passwordHint }}</p>
        <p v-if="unlockError" class="mt-2 text-xs text-red-500 dark:text-red-400">{{ unlockError }}</p>
      </div>
      <div v-if="!hideTitle" class="flex items-center justify-between mb-6 opacity-20 pointer-events-none">
        <h3
          class="font-bold flex items-center gap-2 text-slate-800 dark:text-slate-200"
          :title="category.description ?? undefined"
        >
          <span class="material-symbols-outlined text-indigo-400 text-lg">lock</span>
          {{ category.name }}
        </h3>
      </div>
      <div class="space-y-2 opacity-10">
        <div class="h-8 bg-slate-200 dark:bg-slate-700 rounded-lg" />
        <div class="h-8 bg-slate-200 dark:bg-slate-700 rounded-lg" />
        <div class="h-8 bg-slate-200 dark:bg-slate-700 rounded-lg" />
      </div>
    </template>
    <template v-else>
    <!-- 分类设置菜单：Teleport 到 body 避免被卡片裁剪，更紧凑的图标排布 -->
    <Teleport to="body">
      <Transition name="menu-pop">
        <div
          v-if="settingsMenuOpen"
          ref="settingsMenuRef"
          class="category-settings-menu fixed z-[110] flex flex-col rounded-xl shadow-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800/95 dark:backdrop-blur-xl py-0.5 pointer-events-auto"
          :style="{ top: `${settingsMenuPos.top}px`, right: `${settingsMenuPos.right}px` }"
        >
          <button
            type="button"
            class="p-1.5 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-200/50 dark:hover:bg-white/10 hover:text-amber-500 dark:hover:text-amber-400 transition-colors"
            title="检测并清理失效链接"
            :disabled="list.length === 0"
            @click.stop="onCheckAndCleanupClick()"
          >
            <span class="material-symbols-outlined text-lg block">bolt</span>
          </button>
          <button
            type="button"
            class="p-1.5 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-200/50 dark:hover:bg-white/10 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
            title="编辑"
            @click.stop="closeSettingsMenu(); emit('editCategory')"
          >
            <span class="material-symbols-outlined text-lg block">edit</span>
          </button>
          <button
            type="button"
            class="p-1.5 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-red-500/10 dark:hover:bg-red-500/20 hover:text-red-600 dark:hover:text-red-400 transition-colors"
            title="删除分类"
            @click.stop="closeSettingsMenu(); emit('deleteCategory')"
          >
            <span class="material-symbols-outlined text-lg block">delete</span>
          </button>
        </div>
      </Transition>
    </Teleport>
    <!-- 分类全部书签浮层：点击分类名打开，私密未解锁时不显示 -->
    <Teleport to="body">
      <Transition name="modal-fade">
        <div
          v-if="bookmarksOverlayOpen"
          class="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/30 dark:bg-black/50 backdrop-blur-sm modal-fade-overlay"
          @click.self="closeBookmarksOverlay"
        >
          <div
            class="modal-fade-panel w-full max-w-[70vw] max-h-[80vh] overflow-hidden rounded-2xl shadow-2xl border border-slate-200 dark:border-white/20 flex flex-col bg-white/95 dark:bg-white/5 backdrop-blur-xl"
            role="dialog"
            aria-modal="true"
            :aria-label="`${category.name} 书签列表`"
          >
            <div class="px-4 py-3 border-b border-slate-200 dark:border-white/10 flex items-center justify-between shrink-0">
              <span class="font-semibold text-slate-800 dark-text-94 truncate min-w-0">
                {{ category.name }} · 共 {{ bookmarksInCategory.length }} 个书签
              </span>
              <button
                type="button"
                class="shrink-0 p-2 rounded-lg text-slate-500 dark:text-slate-400 hover:bg-slate-200/50 dark:hover:bg-white/10 hover:text-slate-700 dark:hover:text-white transition-colors"
                title="关闭"
                aria-label="关闭"
                @click="closeBookmarksOverlay"
              >
                <span class="material-symbols-outlined text-xl block">close</span>
              </button>
            </div>
            <div class="flex-1 min-h-0 overflow-y-auto p-4 custom-scrollbar">
              <div
                v-if="bookmarksInCategory.length === 0"
                class="text-sm text-slate-500 dark:text-slate-400 py-8 text-center"
              >
                该分类下暂无书签
              </div>
              <div
                v-else
                class="grid gap-4 grid-cols-[repeat(auto-fill,minmax(min(100%,6.5rem),1fr))] place-items-start"
              >
                <div
                  v-for="b in bookmarksInCategory"
                  :key="b.id"
                  class="flex flex-col items-center min-w-0 w-full p-2 rounded-xl hover:bg-slate-200/50 dark:hover:bg-white/10 transition-colors cursor-context-menu"
                  @contextmenu.prevent="(e) => openContextMenu(e, b)"
                >
                  <BookmarkIcon
                    :bookmark="b"
                    show-title
                    size="lg"
                    :not-draggable="true"
                    :no-hover-bg="true"
                    class="!p-0 w-full"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>
    <!-- 非 hideTitle 时显示分类标题行：分类名与右侧三个按键同一 flex 行、垂直居中；点击分类名（私密未解锁时不可点）打开该分类全部书签浮层 -->
    <div
      v-if="!hideTitle"
      class="flex items-center justify-between gap-2 pl-2 pr-2 min-h-9"
      :class="viewLevel === 0 ? 'mb-2' : 'mb-6'"
    >
      <h3
        class="font-bold flex items-center gap-1.5 min-w-0 text-slate-800 dark-text-94"
        :title="category.description ?? undefined"
      >
        <span
          v-if="editLayout"
          class="category-drag-handle shrink-0 flex items-center justify-center w-5 h-5 cursor-grab active:cursor-grabbing text-slate-400 dark:text-slate-500 touch-none"
          title="拖拽以移动分类"
          aria-label="拖拽以移动分类"
        >
          <span class="material-symbols-outlined text-xl leading-none block">drag_indicator</span>
        </span>
        <span
          v-if="category.isPrivate"
          class="material-symbols-outlined text-indigo-400 text-lg shrink-0"
        >
          lock
        </span>
        <span
          class="truncate min-w-0"
          :class="canOpenBookmarksOverlay ? 'cursor-pointer hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors' : ''"
          :title="canOpenBookmarksOverlay ? '点击查看本分类全部书签' : undefined"
          @click="openBookmarksOverlay"
        >
          {{ category.name }}
        </span>
      </h3>
      <!-- 右侧：非悬停显示书签数量角标，悬停显示三个操作键（新增 / 展开层级 / 设置） -->
      <div class="relative shrink-0 min-h-9 min-w-[7.25rem] flex items-center justify-end">
        <span
          v-if="list.length > 0"
          class="text-[11px] tabular-nums font-medium text-slate-400/70 dark:text-slate-500/70 opacity-100 group-hover:opacity-0 transition-opacity duration-200 pointer-events-none select-none"
        >
          {{ list.length }}
        </span>
        <div
          class="absolute inset-y-0 right-0 flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none group-hover:pointer-events-auto"
        >
          <button
            v-if="!noAddInGrid"
            type="button"
            class="size-9 shrink-0 rounded-lg flex items-center justify-center text-slate-600 dark:text-slate-300 hover:bg-slate-200/50 dark:hover:bg-white/10 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
            title="新增书签"
            @click.stop="openAdd"
          >
            <span class="material-symbols-outlined text-lg">add</span>
          </button>
          <button
            type="button"
            class="size-9 shrink-0 rounded-lg flex items-center justify-center text-slate-600 dark:text-slate-300 hover:bg-slate-200/50 dark:hover:bg-white/10 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
            :title="viewLevelTitle"
            @click.stop="toggleViewLevel"
          >
            <span class="material-symbols-outlined text-lg">{{ viewLevelIcon }}</span>
          </button>
          <div v-if="!noRenameDelete" class="relative">
            <button
              ref="settingsTriggerRef"
              type="button"
              class="size-9 shrink-0 rounded-lg flex items-center justify-center text-slate-600 dark:text-slate-300 bg-transparent dark:bg-slate-700/80 hover:bg-slate-200/50 dark:hover:bg-slate-600/80 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
              title="设置"
              aria-haspopup="menu"
              :aria-expanded="settingsMenuOpen"
              @click.stop="toggleSettingsMenu()"
            >
              <span class="material-symbols-outlined text-lg">settings</span>
            </button>
          </div>
        </div>
      </div>
    </div>
    <!-- 书签网格：未分类（hideTitle）为自适应列数，分类卡片为 2 列；限制高度约 10 行，超出可滚动；未分类无书签时保持最小高度便于拖放落入；折叠为「仅标题」时内容区高度 1rem -->
    <div
      :class="[
        hideTitle ? 'grid grid-cols-[repeat(auto-fill,minmax(min(100%,7rem),1fr))] gap-2' : '',
        'transition-all duration-300 ease-in-out min-h-0 custom-scrollbar',
        hideTitle && noAddInGrid ? 'min-h-[3rem]' : '',
        viewLevel === 0 ? 'min-h-[1rem] max-h-[1rem] opacity-0 overflow-hidden invisible !mt-0 !mb-0' : '',
        viewLevel === 1 ? 'max-h-[146px] overflow-y-auto' : '',
        viewLevel === 2 ? 'max-h-[512px] overflow-y-auto' : '',
        viewLevel === 3 ? 'max-h-none overflow-y-auto' : ''
      ]"
    >
      <draggable
        v-model="list"
        item-key="id"
        group="bookmarks"
        :handle="editLayout ? '.bookmark-drag-handle' : undefined"
        :class="[
          hideTitle ? (noAddInGrid && list.length === 0 ? 'min-h-[3rem] grid grid-cols-1 gap-2 place-items-center' : 'contents') : 'grid grid-cols-2 gap-2'
        ]"
        ghost-class="opacity-50"
        :disabled="!editLayout"
        @end="onDragEnd"
        @change="onListChange"
      >
        <template #item="{ element }">
          <div
            class="flex items-center gap-1 min-w-0 flex-1 overflow-hidden p-2 rounded-xl hover:bg-slate-200/50 dark:hover:bg-white/10 dark:text-slate-300 dark:hover:text-white transition-colors cursor-context-menu"
            @contextmenu.prevent="(e) => openContextMenu(e, element)"
          >
            <span
              v-if="editLayout"
              class="bookmark-drag-handle shrink-0 flex items-center justify-center w-5 h-5 cursor-grab active:cursor-grabbing text-slate-400 dark:text-slate-500 touch-none"
              title="拖拽以移动"
              aria-label="拖拽以移动"
            >
              <span class="material-symbols-outlined text-xl leading-none block">drag_indicator</span>
            </span>
            <BookmarkIcon :bookmark="element" show-title size="md" :not-draggable="editLayout" :no-hover-bg="true" class="!p-0 !min-w-0 flex-1 flex-row gap-2 min-w-0" />
          </div>
        </template>
      </draggable>
      <!-- hideTitle 且非 addInHeader 且未禁用网格添加格时：添加按钮紧跟标签之后，同一网格内 -->
      <button
        v-if="hideTitle && !addInHeader && !noAddInGrid"
        type="button"
        class="flex flex-col items-center justify-center gap-2 p-4 rounded-xl border-2 border-dashed border-slate-300/70 dark:border-white/20 text-slate-400 dark-text-94 hover:border-indigo-400/50 hover:text-indigo-500 dark:hover:border-indigo-400/50 dark:hover:text-indigo-400 transition-colors cursor-pointer min-h-[4.5rem]"
        title="添加书签"
        @click="openAdd"
      >
        <span class="material-symbols-outlined text-2xl">add</span>
        <span class="text-xs font-semibold">Add</span>
      </button>
    </div>
    <!-- 书签右键菜单 -->
    <Teleport to="body">
      <Transition name="menu-pop">
        <div
          v-if="contextMenuOpen && contextMenuBookmark"
          ref="contextMenuRef"
          class="bookmark-context-menu fixed z-[100] inline-flex flex-col min-w-[7.5rem] py-1.5 bg-white dark:bg-slate-800/95 dark:backdrop-blur-xl rounded-2xl shadow-xl border border-slate-200 dark:border-slate-600"
          :style="contextMenuStyle"
        >
        <button
          type="button"
          class="w-full text-left px-4 py-2.5 text-sm text-slate-800 dark:text-slate-200 hover:bg-slate-200/50 dark:hover:bg-white/10 transition-colors cursor-pointer"
          @click="openInNewWindow(contextMenuBookmark)"
        >
          新窗口打开
        </button>
        <div class="my-1 border-t border-slate-200 dark:border-slate-600" />
        <button
          type="button"
          class="w-full text-left px-4 py-2.5 text-sm text-slate-800 dark:text-slate-200 hover:bg-slate-200/50 dark:hover:bg-white/10 transition-colors cursor-pointer"
          @click="handleContextTogglePinned(contextMenuBookmark)"
        >
          {{ contextMenuBookmark && pinnedStore.ids.includes(contextMenuBookmark.id) ? '从常用移除' : '添加到常用' }}
        </button>
        <button
          v-if="showMoveToUncategorized"
          type="button"
          class="w-full text-left px-4 py-2.5 text-sm text-slate-800 dark:text-slate-200 hover:bg-slate-200/50 dark:hover:bg-white/10 transition-colors cursor-pointer"
          @click="handleContextMoveToUncategorized(contextMenuBookmark)"
        >
          移入未分类
        </button>
        <button
          type="button"
          class="w-full text-left px-4 py-2.5 text-sm text-slate-800 dark:text-slate-200 hover:bg-slate-200/50 dark:hover:bg-white/10 transition-colors cursor-pointer"
          @click="handleContextEdit(contextMenuBookmark)"
        >
          编辑
        </button>
        <button
          type="button"
          class="w-full text-left px-4 py-2.5 text-sm text-slate-800 dark:text-slate-200 hover:bg-red-50 dark:hover:bg-red-500/20 hover:text-red-600 dark:hover:text-red-400 transition-colors cursor-pointer"
          @click="handleContextDelete(contextMenuBookmark)"
        >
          删除
        </button>
        </div>
      </Transition>
    </Teleport>

    <BookmarkForm
      v-model="formOpen"
      :category-id="category.id"
      :edit="editingBookmark"
      @save="onSaveBookmark"
    />
    </template>
  </div>
</template>
