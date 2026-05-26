import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { MeiliSearch } from 'meilisearch';

const INDEX = 'messages';

export interface MeiliMessage {
  id: string;
  roomId: string;
  senderId: string;
  type: string;
  content: string;
  locale: string;
  createdAt: number;
}

@Injectable()
export class MeilisearchService implements OnModuleInit {
  private client: MeiliSearch;
  private readonly logger = new Logger(MeilisearchService.name);

  async onModuleInit() {
    this.client = new MeiliSearch({
      host: process.env.MEILI_URL ?? 'http://meilisearch:7700',
      apiKey: process.env.MEILI_KEY ?? process.env.MEILI_MASTER_KEY ?? 'nova_dev_master_key',
    });
    await this.ensureIndex();
  }

  private async ensureIndex() {
    try {
      const idx = this.client.index(INDEX);
      await idx.updateSettings({
        searchableAttributes: ['content'],
        filterableAttributes: ['roomId', 'senderId', 'type', 'locale', 'createdAt'],
        sortableAttributes: ['createdAt'],
      });
      this.logger.log('Meilisearch index ready');
    } catch (e) {
      this.logger.warn({ event: 'meili_init_warn', err: e?.message });
    }
  }

  async indexMessage(msg: MeiliMessage): Promise<void> {
    try {
      await this.client.index(INDEX).addDocuments([msg]);
    } catch (e) {
      this.logger.warn({ event: 'meili_index_fail', err: e?.message });
    }
  }

  async search(query: string, filters: {
    roomId?: string;
    senderId?: string;
    type?: string;
    dateFrom?: number;
    dateTo?: number;
  }, limit = 20, offset = 0): Promise<{ hits: MeiliMessage[]; total: number }> {
    const filterParts: string[] = [];
    if (filters.roomId) filterParts.push(`roomId = "${filters.roomId}"`);
    if (filters.senderId) filterParts.push(`senderId = "${filters.senderId}"`);
    if (filters.type) filterParts.push(`type = "${filters.type}"`);
    if (filters.dateFrom) filterParts.push(`createdAt >= ${filters.dateFrom}`);
    if (filters.dateTo) filterParts.push(`createdAt <= ${filters.dateTo}`);

    const result = await this.client.index(INDEX).search(query, {
      filter: filterParts.join(' AND ') || undefined,
      limit,
      offset,
      sort: ['createdAt:desc'],
    });

    return { hits: result.hits as MeiliMessage[], total: result.estimatedTotalHits ?? 0 };
  }

  async deleteMessage(id: string): Promise<void> {
    try {
      await this.client.index(INDEX).deleteDocument(id);
    } catch {}
  }
}
