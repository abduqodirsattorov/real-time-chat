import { Injectable } from '@nestjs/common';
import * as path from 'path';
import * as fs from 'fs';

type Locale = 'uz' | 'ru';

@Injectable()
export class I18nService {
  private readonly messages: Record<Locale, any> = {
    uz: this.load('uz'),
    ru: this.load('ru'),
  };

  private load(locale: Locale): any {
    const filePath = path.join(__dirname, '..', '..', 'locales', `${locale}.json`);
    try {
      return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch {
      return {};
    }
  }

  t(locale: Locale, key: string, vars: Record<string, string> = {}): string {
    const keys = key.split('.');
    let val: any = this.messages[locale] ?? this.messages['uz'];
    for (const k of keys) {
      if (val == null) break;
      val = val[k];
    }
    if (typeof val !== 'string') return key;
    return val.replace(/\{(\w+)\}/g, (_, name) => vars[name] ?? '');
  }
}
