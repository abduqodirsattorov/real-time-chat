import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import * as crypto from 'crypto';

export interface NovaProfile {
  user_uid: string;
  full_name?: string;
  phone?: string;
  passport?: string;
  nationality?: string;
  birth_date?: string;
  language?: string;
  citizenship?: string;
  is_identified?: boolean;
  is_blocked?: boolean;
  registered_at?: string;
  email?: string | null;
  [key: string]: unknown;
}

export interface NovaTransaction {
  ext_id: string;
  user_uid: string;
  [key: string]: unknown;
}

export interface NovaTransactionList {
  items: NovaTransaction[];
  total: number;
  page: number;
}

export interface NovaAction {
  key: string;
  label: string;
  enabled: boolean;
  reason?: string;
}

export interface NovaActionResult {
  success: boolean;
  result: Record<string, unknown>;
}

export interface NovaTransactionParams {
  userUid?: string;
  page?: number;
  limit?: number;
  provider?: string;
  type?: string;
  dateFrom?: string;
  dateTo?: string;
}

@Injectable()
export class NovaService {
  private readonly logger = new Logger(NovaService.name);
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly hmacSecret: string;

  constructor() {
    this.baseUrl = process.env.NOVA_BASE_URL ?? 'http://mock-nova:3009';
    this.apiKey = process.env.NOVA_API_KEY ?? 'nova_api_key_change_me';
    this.hmacSecret = process.env.NOVA_HMAC_SECRET ?? 'nova_hmac_secret_change_me_32c';
  }

  private sign(body: string): string {
    return crypto.createHmac('sha256', this.hmacSecret).update(body).digest('hex');
  }

  private async request<T>(method: 'GET' | 'POST', path: string, body?: object): Promise<T> {
    const bodyStr = body ? JSON.stringify(body) : '';
    const headers: Record<string, string> = {
      'X-API-Key': this.apiKey,
      'X-Signature': this.sign(bodyStr),
    };
    if (body) headers['Content-Type'] = 'application/json';

    let lastError: unknown;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const res = await axios<T>({
          method,
          url: `${this.baseUrl}${path}`,
          data: body,
          headers,
          timeout: 10_000,
        });
        return res.data;
      } catch (err: unknown) {
        // Don't retry client errors (4xx) — they indicate a logic error
        const status = (err as any)?.response?.status as number | undefined;
        if (status !== undefined && status >= 400 && status < 500) throw err;

        lastError = err;
        if (attempt < 2) {
          const delayMs = 500 * Math.pow(2, attempt); // 500 ms, 1000 ms
          this.logger.warn(
            `Nova ${method} ${path} failed (attempt ${attempt + 1}/3), retry in ${delayMs}ms`,
          );
          await new Promise(r => setTimeout(r, delayMs));
        }
      }
    }
    this.logger.error(`Nova ${method} ${path} failed after 3 attempts`);
    throw lastError;
  }

  async health(): Promise<{ status: string; service: string }> {
    const res = await axios.get<{ status: string; service: string }>(
      `${this.baseUrl}/health`,
      { timeout: 5_000 },
    );
    return res.data;
  }

  getProfile(userUid: string): Promise<NovaProfile> {
    return this.request<NovaProfile>('GET', `/api/support/profile/${userUid}`);
  }

  getTransactions(params: NovaTransactionParams = {}): Promise<NovaTransactionList> {
    const qs = new URLSearchParams();
    if (params.userUid) qs.set('user_uid', params.userUid);
    if (params.page) qs.set('page', String(params.page));
    if (params.limit) qs.set('limit', String(params.limit));
    if (params.provider) qs.set('provider', params.provider);
    if (params.type) qs.set('type', params.type);
    if (params.dateFrom) qs.set('date_from', params.dateFrom);
    if (params.dateTo) qs.set('date_to', params.dateTo);
    const query = qs.toString();
    return this.request<NovaTransactionList>('GET', `/api/support/transactions${query ? `?${query}` : ''}`);
  }

  getTransaction(extId: string): Promise<NovaTransaction> {
    return this.request<NovaTransaction>('GET', `/api/support/transaction/${extId}`);
  }

  getActions(extId: string): Promise<{ actions: NovaAction[] }> {
    return this.request<{ actions: NovaAction[] }>('GET', `/api/support/transaction/${extId}/actions`);
  }

  executeAction(
    extId: string,
    action: string,
    operatorId: string,
    params?: object,
  ): Promise<NovaActionResult> {
    return this.request<NovaActionResult>('POST', `/api/support/transaction/${extId}/action`, {
      action,
      operator_id: operatorId,
      params: params ?? {},
    });
  }
}
