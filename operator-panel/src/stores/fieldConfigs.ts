import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { fieldConfigsApi, type FieldConfig } from '@/api/fieldConfigs';

export const useFieldConfigsStore = defineStore('fieldConfigs', () => {
  const configs = ref<Record<string, FieldConfig[]>>({});
  const loading = ref<Record<string, boolean>>({});

  async function load(context: string) {
    if (configs.value[context]) return;
    loading.value[context] = true;
    try {
      configs.value[context] = await fieldConfigsApi.list(context);
    } catch {
      configs.value[context] = [];
    } finally {
      loading.value[context] = false;
    }
  }

  function get(context: string): FieldConfig[] {
    return configs.value[context] ?? [];
  }

  function visible(context: string): FieldConfig[] {
    return get(context)
      .filter((c) => c.visible)
      .sort((a, b) => a.sortOrder - b.sortOrder);
  }

  async function update(context: string, items: FieldConfig[]) {
    const updated = await fieldConfigsApi.bulkUpdate(
      context,
      items.map(({ fieldKey, label, visible: v, sortOrder, displayType }) => ({
        fieldKey, label, visible: v, sortOrder, displayType,
      })),
    );
    configs.value[context] = updated;
  }

  function invalidate(context: string) {
    delete configs.value[context];
  }

  return { configs, loading, load, get, visible, update, invalidate };
});
