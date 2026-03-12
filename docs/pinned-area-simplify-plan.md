# 常用区简化方案（保留大图标）

## 一、目标

1. **结构统一**：常用区改为「区域块 + 块内列表」形态，与未分类一致的概念模型，便于维护。
2. **保留大图标**：块内仍使用大卡片 + `BookmarkIcon size="lg"`，不改为小图标。
3. **修复拖拽**：通过**拖拽把手（handle）**统一解决「从书签图标上拖不动」的问题，分类 ↔ 分类、分类 → 常用、未分类 → 常用均从把手开拖即可。

---

## 二、方案要点

### 2.1 常用区形态调整（仅结构，视觉保持）

- **当前**：`<section>` 下直接是 `div.grid` + `<draggable>` + Add 按钮，没有「一块板」的容器。
- **调整后**：
  - 在 section 标题栏（常用 + 编辑布局）下方增加**块级容器**（如 `div`，可选圆角/边框/背景与未分类块风格统一）。
  - 块内保持现有**响应式网格**：`grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3 md:gap-4`。
  - 块内仍为：`<draggable>`（class="contents"）+ 每个 item 大卡片（`glass-translucent rounded-2xl p-4`）+ `BookmarkIcon size="lg"` + Add 按钮。
- **不改**：单卡样式、图标尺寸、网格列数、空状态文案、Add 弹窗与右键菜单逻辑。

### 2.2 拖拽把手（handle）统一

- **问题**：编辑模式下，列表项内的 `<a>` 被设为 `draggable="false"`，从链接/图标上开拖无法触发 Sortable，只有从空白处拖才有效。
- **做法**：编辑模式下在**所有可拖拽书签列表项**上增加**拖拽把手**（如 grip 图标），并让 vuedraggable 的 `handle` 只认该把手；用户从把手上开拖即可在分类内、跨分类、拖入常用区都生效。
- **范围**：
  - **常用区**（Home.vue）：每个常用项在编辑模式下显示把手；`<draggable>` 增加 `handle=".pinned-drag-handle"`（或统一 class 名）。
  - **分类卡片**（CategoryCard.vue）：每个书签项在 `editLayout` 时显示把手；`<draggable>` 增加 `handle=".category-drag-handle"`。为减少重复与样式统一，可与常用区共用同一 class，如 `.bookmark-drag-handle`，然后两边都设 `handle=".bookmark-drag-handle"`。

这样「从书签上拖不动」的问题通过「从把手拖」规避，无需改动 `notDraggable` 的语义（链接仍不参与原生拖拽，避免误拖成 URL）。

---

## 三、涉及文件与改动清单

### 3.1 `src/views/Home.vue`

| 改动项 | 说明 |
|--------|------|
| 常用区 section 结构 | 在标题栏与下方 grid 之间增加一块容器 `div`（例如 `class="rounded-2xl ..."` 与未分类块风格一致），把「grid + draggable + Add 按钮」包进该 div。 |
| 常用区列表项模板 | 在每个 item 的根 `div` 内、在 `BookmarkIcon` 前（或左上角）增加拖拽把手：`isEditLayout` 为 true 时渲染一个 `span.bookmark-drag-handle`（或 `pinned-drag-handle`），内含 grip 图标（如 `material-symbols-outlined drag_indicator`），并加上 `cursor-grab` 等样式。 |
| draggable 配置 | 为常用区 `<draggable>` 增加 `:handle="isEditLayout ? '.bookmark-drag-handle' : undefined"`（或仅编辑时生效的 selector），保证只有从把手拖才触发排序/跨列表。 |
| 逻辑与数据 | `pinnedList`、`onPinnedListChange`、`onPinnedDragEnd`、`group.put` 条件、`disabled`、Add 按钮与弹窗、右键菜单、空状态文案均保持不变。 |

### 3.2 `src/components/category/CategoryCard.vue`

| 改动项 | 说明 |
|--------|------|
| 列表项模板 | 在现有包住 `BookmarkIcon` 的 `div` 内，当 `editLayout` 为 true 时，在 `BookmarkIcon` 前增加拖拽把手：`span.bookmark-drag-handle` + grip 图标，样式与常用区把手统一（如小图标、灰色、cursor-grab）。 |
| draggable 配置 | 为分类内 `<draggable>` 增加 `:handle="editLayout ? '.bookmark-drag-handle' : undefined"`，使编辑模式下仅从把手开始拖拽。 |
| 其他 | `group="bookmarks"`、`onListChange`、`onDragEnd`、`BookmarkIcon` 的 `not-draggable="editLayout"` 保持不变。 |

### 3.3 `src/components/bookmark/BookmarkIcon.vue`

| 改动项 | 说明 |
|--------|------|
| 无必须改动 | 继续使用 `notDraggable` 控制 `<a>` 的 `draggable` 即可；把手在父级列表项中，不放在 BookmarkIcon 内部也可。若希望把手与图标更一体化，可后续再考虑在 BookmarkIcon 上增加 slot 或 prop，本方案不强制。 |

### 3.4 样式与可访问性

- 把手在编辑模式下显示，非编辑模式下不渲染或隐藏，避免占用空间。
- 把手建议：`cursor-grab`，拖拽中可配合 `cursor-grabbing`（若 vuedraggable 未自动处理，可后续加）。
- 可选：为把手加 `aria-label="拖拽以移动"` 或 `title`，便于无障碍与提示。

---

## 四、数据与交互（无变更）

- **数据**：常用区仍由 `pinnedStore.ids` / `pinnedBookmarks` 驱动，`pinnedList` 同步方式不变；`onPinnedListChange` 仍对 `evt.added` 执行 `pinnedStore.add`、`savePinned`、`categoryListsVersion++`。
- **编辑模式**：仅当 `isEditLayout` 为 true 时常用区可拖拽排序、可接受放入；`group.put` 条件与 `MAX_PINNED` 不变。
- **添加与右键**：Add 按钮与弹窗、常用区书签右键「新窗口打开」「从常用移除」保持原样。

---

## 五、实施顺序建议

1. **CategoryCard**：先加把手 + `handle`，验证分类内、跨分类、拖到未分类是否都从把手拖即可用。
2. **Home 常用区**：加块级容器（保留大图标与网格）、加把手 + `handle`，验证从分类/未分类拖入常用区是否正常。
3. **样式与无障碍**：统一把手样式与 aria/title，按需微调间距与对齐。

---

## 六、验收要点

- 常用区在视觉上仍为「大图标 + 多列网格」，仅多了一个外层块容器。
- 编辑模式下，分类内、未分类内、常用区内列表项均显示拖拽把手；仅从把手拖拽可排序或跨列表移动。
- 从分类/未分类拖到常用区：放入后 `pinnedStore` 更新、分类列表重同步、常用区显示正确。
- 非编辑模式下，常用区不显示把手、不可拖拽，点击/右键行为与现有一致。
