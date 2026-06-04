import { defineStore } from 'pinia';
import { ref } from 'vue';
import { tagsApi, type Tag } from '@/api/tags';

export const useTagsStore = defineStore('tags', () => {
  const tags = ref<Tag[]>([]);
  const loading = ref(false);

  async function loadTags() {
    loading.value = true;
    try {
      tags.value = await tagsApi.list();
    } catch (e) {
      console.error('[tags] loadTags failed:', e);
    } finally {
      loading.value = false;
    }
  }

  function getById(id: string): Tag | undefined {
    return tags.value.find(t => t.id === id);
  }

  function getByIds(ids: string[]): Tag[] {
    return ids.map(id => getById(id)).filter(Boolean) as Tag[];
  }

  return { tags, loading, loadTags, getById, getByIds };
});
