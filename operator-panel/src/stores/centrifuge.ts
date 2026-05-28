import { defineStore } from 'pinia';
import { ref } from 'vue';
import { Centrifuge, type Subscription } from 'centrifuge';
import { authApi } from '@/api/auth';

export const useCentrifugeStore = defineStore('centrifuge', () => {
  const client = ref<Centrifuge | null>(null);
  const connected = ref(false);
  const subscriptions = new Map<string, Subscription>();

  async function connect() {
    if (client.value?.state === 'connected') return;

    const { token } = await authApi.centrifugoToken();

    const c = new Centrifuge('/connection/websocket', {
      token,
      getToken: async () => {
        const res = await authApi.centrifugoToken();
        return res.token;
      },
    });

    c.on('connected', () => { connected.value = true; });
    c.on('disconnected', () => { connected.value = false; });

    c.connect();
    client.value = c;
  }

  async function subscribe(
    channel: string,
    onPublication: (data: unknown) => void,
  ): Promise<Subscription> {
    if (!client.value) await connect();

    if (subscriptions.has(channel)) {
      return subscriptions.get(channel)!;
    }

    const { token } = await authApi.centrifugoSubscribeToken(channel);

    const sub = client.value!.newSubscription(channel, { token });
    sub.on('publication', (ctx) => onPublication(ctx.data));
    sub.subscribe();
    subscriptions.set(channel, sub);
    return sub;
  }

  function unsubscribe(channel: string) {
    const sub = subscriptions.get(channel);
    if (sub) {
      sub.unsubscribe();
      subscriptions.delete(channel);
    }
  }

  function disconnect() {
    subscriptions.forEach((sub) => sub.unsubscribe());
    subscriptions.clear();
    client.value?.disconnect();
    client.value = null;
    connected.value = false;
  }

  return { client, connected, connect, subscribe, unsubscribe, disconnect };
});
