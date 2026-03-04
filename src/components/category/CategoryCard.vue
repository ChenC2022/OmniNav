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
  }>(),
  { editLayout: true, hideTitle: false, addInHeader: false, noRenameDelete: false, noAddInGrid: false }
)

const emit = defineEmits<{
  (e: 'editCategory'): void
  (e: 'deleteCategory'): void
}>()

const bookmarksStore = useBookmarksStore()
const saveBookmarks = inject<() => Promise<void>>('saveBookmarks')
const savePinned = inject<() => Promise<void>>('savePinned')
const runCheckAndCleanupForCategory = inject<(categoryId: string) => void>('runCheckAndCleanupForCategory')
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

/** 该分类下是否有书签在常用区：有则不能直接删除分类 */
const hasPinnedInCategory = computed(() =>
  bookmarksInCategory.value.some((b) => pinnedStore.ids.includes(b.id))
)
const canDeleteCategory = computed(() => !hasPinnedInCategory.value)

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

// 右键上下文菜单
const contextMenuOpen = ref(false)
const contextMenuPos = ref({ x: 0, y: 0 })
const contextMenuBookmark = ref<Bookmark | null>(null)
const contextMenuRef = ref<HTMLElement | null>(null)

function openContextMenu(e: MouseEvent, bookmark: Bookmark) {
  e.preventDefault()
  contextMenuBookmark.value = bookmark
  contextMenuPos.value = { x: e.clientX, y: e.clientY }
  contextMenuOpen.value = true
}

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
    class="group card-root glass-translucent rounded-2xl p-2 relative overflow-hidden card-hover"
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
            class="w-full bg-slate-50 dark:bg-white/10 dark:backdrop-blur-[10px] border border-slate-200 dark:border-white/20 rounded-xl px-4 py-2.5 text-sm text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-white/50 focus:ring-2 focus:ring-indigo-400/50 focus:border-indigo-400 transition-all"
            placeholder="••••••••"
            @keydown.enter="unlock()"
          />
          <button
            type="button"
            class="w-full bg-slate-900 dark:bg-white/15 dark:backdrop-blur-[10px] dark:border dark:border-white/20 hover:bg-slate-800 dark:hover:bg-white/20 py-2.5 rounded-xl text-xs font-bold text-white transition-colors disabled:opacity-50"
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
    <!-- 悬停时右上角显示：新增（未禁用网格添加格时）；非未分类时显示设置（编辑/删除） -->
    <div
      class="absolute top-3 right-3 z-10 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none group-hover:pointer-events-auto"
    >
      <button
        v-if="!noAddInGrid"
        type="button"
        class="size-9 shrink-0 rounded-lg flex items-center justify-center text-slate-600 dark:text-slate-300 hover:bg-slate-200/80 dark:hover:bg-white/15 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
        title="新增书签"
        @click.stop="openAdd"
      >
        <span class="material-symbols-outlined text-lg">add</span>
      </button>
      <div v-if="!noRenameDelete" class="relative">
        <button
          ref="settingsTriggerRef"
          type="button"
          class="size-9 shrink-0 rounded-lg flex items-center justify-center text-slate-600 dark:text-slate-300 hover:bg-slate-200/80 dark:hover:bg-white/15 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
          title="设置"
          aria-haspopup="menu"
          :aria-expanded="settingsMenuOpen"
          @click.stop="toggleSettingsMenu()"
        >
          <span class="material-symbols-outlined text-lg">settings</span>
        </button>
      </div>
    </div>
    <!-- 分类设置菜单：Teleport 到 body 避免被卡片裁剪，更紧凑的图标排布 -->
    <Teleport to="body">
      <Transition name="menu-pop">
        <div
          v-if="settingsMenuOpen"
          ref="settingsMenuRef"
          class="fixed z-[110] flex flex-col rounded-xl shadow-xl border border-slate-200 dark:border-white/20 bg-white dark:bg-white/10 dark:backdrop-blur-xl py-0.5 pointer-events-auto"
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
            class="p-1.5 rounded-lg transition-colors"
            :class="canDeleteCategory ? 'text-slate-600 dark:text-slate-300 hover:bg-red-500/10 dark:hover:bg-red-500/20 hover:text-red-600 dark:hover:text-red-400' : 'text-slate-400 dark:text-slate-500 cursor-not-allowed'"
            :title="canDeleteCategory ? '删除分类' : '该分类下有书签在常用区，请先从常用区移除后再删除'"
            :disabled="!canDeleteCategory"
            @click.stop="canDeleteCategory && (closeSettingsMenu(), emit('deleteCategory'))"
          >
            <span class="material-symbols-outlined text-lg block">delete</span>
          </button>
        </div>
      </Transition>
    </Teleport>
    <!-- 非 hideTitle 时显示分类标题行；编辑布局下标题前显示分类块拖拽把手 -->
    <div
      v-if="!hideTitle"
      class="flex items-center justify-between mb-6 pl-2 pr-24"
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
        <span v-if="category.isPrivate" class="material-symbols-outlined text-indigo-400 text-lg shrink-0">lock</span>
        <span class="truncate">{{ category.name }}</span>
      </h3>
    </div>
    <!-- 书签网格：未分类（hideTitle）为自适应列数，分类卡片为 2 列；限制高度约 10 行，超出可滚动；未分类无书签时保持最小高度便于拖放落入 -->
    <div
      :class="[
        hideTitle ? 'grid grid-cols-[repeat(auto-fill,minmax(min(100%,7rem),1fr))] gap-2' : '',
        'max-h-[30rem] overflow-y-auto min-h-0 custom-scrollbar',
        hideTitle && noAddInGrid ? 'min-h-[3rem]' : ''
      ]"
    >
      <draggable
        v-model="list"
        item-key="id"
        group="bookmarks"
        :handle="editLayout ? '.bookmark-drag-handle' : undefined"
        :class="hideTitle ? 'contents' : 'grid grid-cols-2 gap-2'"
        ghost-class="opacity-50"
        :disabled="!editLayout"
        @end="onDragEnd"
        @change="onListChange"
      >
        <template #item="{ element }">
          <div
            class="flex items-center gap-1 min-w-0 flex-1 overflow-hidden p-2 rounded-xl hover:bg-slate-400/30 dark:hover:bg-white/5 transition-colors cursor-context-menu"
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
          class="fixed z-[100] min-w-[140px] py-1.5 bg-white dark:bg-white/10 dark:backdrop-blur-xl rounded-2xl shadow-xl border border-slate-200 dark:border-white/20"
          :style="{ left: `${contextMenuPos.x}px`, top: `${contextMenuPos.y}px` }"
        >
        <button
          type="button"
          class="w-full text-left px-4 py-2.5 text-sm text-slate-800 dark:text-white hover:bg-slate-200/5 dark:hover:bg-white/5 transition-colors cursor-pointer"
          @click="openInNewWindow(contextMenuBookmark)"
        >
          新窗口打开
        </button>
        <div class="my-1 border-t border-slate-200 dark:border-white/20" />
        <button
          type="button"
          class="w-full text-left px-4 py-2.5 text-sm text-slate-800 dark:text-white hover:bg-slate-200/5 dark:hover:bg-white/5 transition-colors cursor-pointer"
          @click="handleContextTogglePinned(contextMenuBookmark)"
        >
          {{ contextMenuBookmark && pinnedStore.ids.includes(contextMenuBookmark.id) ? '从常用移除' : '添加到常用' }}
        </button>
        <button
          type="button"
          class="w-full text-left px-4 py-2.5 text-sm text-slate-800 dark:text-white hover:bg-slate-200/5 dark:hover:bg-white/5 transition-colors cursor-pointer"
          @click="handleContextEdit(contextMenuBookmark)"
        >
          编辑
        </button>
        <button
          type="button"
          class="w-full text-left px-4 py-2.5 text-sm text-slate-800 dark:text-white hover:bg-slate-200/5 dark:hover:bg-red-500/20 hover:text-red-600 dark:hover:text-red-400 transition-colors cursor-pointer"
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
