<template>
  <div class="room-tags" v-if="roomId">
    <!-- Existing tags as badges -->
    <span
      v-for="tag in activeTags"
      :key="tag.id"
      class="tag-badge"
      :style="{ background: tag.color + '22', color: tag.color, borderColor: tag.color + '55' }"
    >
      {{ tag.name }}
      <button class="tag-remove" @click.stop="removeTag(tag.id)" title="O'chirish">×</button>
    </span>

    <!-- Add tag button -->
    <div class="tag-add-wrap" ref="addWrapRef">
      <button class="tag-add-btn" @click.stop="toggleDropdown" :title="t('tags.addTag')">
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>
        {{ t('tags.addTag') }}
      </button>

      <!-- Dropdown -->
      <div v-if="dropdownOpen" class="tag-dropdown">
        <div v-if="availableTags.length === 0" class="tag-dropdown-empty">
          {{ t('tags.noTags') }}
        </div>
        <button
          v-for="tag in availableTags"
          :key="tag.id"
          class="tag-dropdown-item"
          @click.stop="addTag(tag.id)"
        >
          <span class="tag-dropdown-dot" :style="{ background: tag.color }" />
          {{ tag.name }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, onMounted, onBeforeUnmount } from 'vue';
import { useI18n } from 'vue-i18n';
import { useTagsStore } from '@/stores/tags';
import { useRoomsStore } from '@/stores/rooms';
import { tagsApi } from '@/api/tags';

const props = defineProps<{ roomId: string | null }>();

const { t } = useI18n();
const tagsStore = useTagsStore();
const roomsStore = useRoomsStore();

const dropdownOpen = ref(false);
const addWrapRef = ref<HTMLElement | null>(null);

const currentRoom = computed(() =>
  props.roomId ? roomsStore.rooms.find(r => r.id === props.roomId) : null,
);

const activeTags = computed(() =>
  tagsStore.getByIds(currentRoom.value?.tagIds ?? []),
);

const availableTags = computed(() => {
  const activeIds = new Set(currentRoom.value?.tagIds ?? []);
  return tagsStore.tags.filter(t => !activeIds.has(t.id));
});

function toggleDropdown() {
  dropdownOpen.value = !dropdownOpen.value;
}

async function addTag(tagId: string) {
  if (!props.roomId || !currentRoom.value) return;
  const newIds = [...(currentRoom.value.tagIds ?? []), tagId];
  dropdownOpen.value = false;
  try {
    await tagsApi.setRoomTags(props.roomId, newIds);
    // Update local store
    const room = roomsStore.rooms.find(r => r.id === props.roomId);
    if (room) room.tagIds = newIds;
  } catch (e) {
    console.error('[RoomTags] addTag failed:', e);
  }
}

async function removeTag(tagId: string) {
  if (!props.roomId || !currentRoom.value) return;
  const newIds = (currentRoom.value.tagIds ?? []).filter(id => id !== tagId);
  try {
    await tagsApi.setRoomTags(props.roomId, newIds);
    const room = roomsStore.rooms.find(r => r.id === props.roomId);
    if (room) room.tagIds = newIds;
  } catch (e) {
    console.error('[RoomTags] removeTag failed:', e);
  }
}

// Close dropdown on outside click
function handleOutsideClick(e: MouseEvent) {
  if (addWrapRef.value && !addWrapRef.value.contains(e.target as Node)) {
    dropdownOpen.value = false;
  }
}

onMounted(() => {
  document.addEventListener('click', handleOutsideClick);
  tagsStore.loadTags();
});
onBeforeUnmount(() => {
  document.removeEventListener('click', handleOutsideClick);
});
</script>

<style scoped>
.room-tags {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 5px;
}

.tag-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  font-weight: 600;
  padding: 3px 8px;
  border-radius: var(--r-full);
  border: 1px solid transparent;
  white-space: nowrap;
}

.tag-remove {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 14px; height: 14px;
  border-radius: 50%;
  border: none;
  background: transparent;
  font-size: 13px;
  line-height: 1;
  cursor: pointer;
  color: inherit;
  opacity: 0.6;
  padding: 0;
  transition: opacity 0.1s;
}
.tag-remove:hover { opacity: 1; }

.tag-add-wrap {
  position: relative;
}

.tag-add-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  font-weight: 600;
  padding: 3px 8px;
  border-radius: var(--r-full);
  border: 1.5px dashed var(--c-border);
  background: transparent;
  color: var(--c-text-3);
  cursor: pointer;
  transition: all 0.12s;
  white-space: nowrap;
}
.tag-add-btn:hover { border-color: var(--c-accent); color: var(--c-accent); }

.tag-dropdown {
  position: absolute;
  top: calc(100% + 6px);
  left: 0;
  min-width: 140px;
  background: var(--c-bg);
  border: 1px solid var(--c-border);
  border-radius: var(--r-lg);
  box-shadow: 0 4px 16px rgba(0,0,0,0.1);
  padding: 4px;
  z-index: 200;
}

.tag-dropdown-item {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 7px 10px;
  border: none;
  background: transparent;
  border-radius: var(--r-sm);
  font-size: 13px;
  color: var(--c-text);
  cursor: pointer;
  text-align: left;
  transition: background 0.1s;
}
.tag-dropdown-item:hover { background: var(--c-surface); }

.tag-dropdown-dot {
  width: 9px; height: 9px; border-radius: 50%; flex-shrink: 0;
}

.tag-dropdown-empty {
  padding: 8px 10px;
  font-size: 12px;
  color: var(--c-text-3);
}
</style>
