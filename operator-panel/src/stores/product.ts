import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { productsApi, type Product } from '@/api/products';

const STORAGE_KEY = 'selected_product_id';

export const useProductStore = defineStore('product', () => {
  const selectedProductId = ref<string | null>(localStorage.getItem(STORAGE_KEY));
  const products = ref<Product[]>([]);
  const loading = ref(false);

  const selectedProduct = computed(() =>
    products.value.find((p) => p.id === selectedProductId.value) ?? null,
  );

  async function loadProducts() {
    loading.value = true;
    try {
      const res = await productsApi.list();
      // Store all, picker will filter active only
      products.value = res.products;
    } finally {
      loading.value = false;
    }
  }

  async function selectProduct(productId: string) {
    await productsApi.selectProduct(productId);
    selectedProductId.value = productId;
    localStorage.setItem(STORAGE_KEY, productId);
  }

  function clearProduct() {
    selectedProductId.value = null;
    localStorage.removeItem(STORAGE_KEY);
  }

  return { selectedProductId, selectedProduct, products, loading, loadProducts, selectProduct, clearProduct };
});
