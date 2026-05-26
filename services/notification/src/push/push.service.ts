import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';

export interface FcmPayload {
  token: string;
  title: string;
  body: string;
  data?: Record<string, string>;
  highPriority?: boolean;
}

export interface VoipPayload {
  voipToken: string;
  callId: string;
  callerName: string;
  livekitUrl: string;
  livekitToken: string;
}

@Injectable()
export class PushService implements OnModuleInit {
  private readonly logger = new Logger(PushService.name);
  private fcmApp: any = null;
  private fcmEnabled = false;
  private apnsEnabled = false;

  async onModuleInit() {
    await this.initFcm();
    this.initApns();
  }

  private async initFcm() {
    const keyPath = process.env.FCM_SERVICE_ACCOUNT_PATH;
    if (!keyPath || !fs.existsSync(keyPath)) {
      this.logger.warn('FCM_SERVICE_ACCOUNT_PATH not set or file missing — FCM in stub mode');
      return;
    }
    try {
      const admin = await import('firebase-admin');
      const serviceAccount = JSON.parse(fs.readFileSync(keyPath, 'utf8'));
      this.fcmApp = admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
      });
      this.fcmEnabled = true;
      this.logger.log('FCM initialized');
    } catch (err) {
      this.logger.error({ event: 'fcm_init_failed', err });
    }
  }

  private initApns() {
    const keyPath = process.env.APNS_KEY_PATH;
    if (!keyPath || !fs.existsSync(keyPath)) {
      this.logger.warn('APNS_KEY_PATH not set or file missing — APNs in stub mode');
      return;
    }
    // Real APNs init would use node-apn or HTTP/2 provider
    this.apnsEnabled = true;
    this.logger.log('APNs initialized (stub with key present)');
  }

  async sendFcm(payload: FcmPayload): Promise<boolean> {
    if (!this.fcmEnabled) {
      this.logger.log({
        event: 'fcm_stub',
        token: payload.token.slice(0, 8) + '...',
        title: payload.title,
        body: payload.body,
      });
      return true;
    }
    try {
      const admin = await import('firebase-admin');
      const msg: any = {
        token: payload.token,
        notification: { title: payload.title, body: payload.body },
        data: payload.data ?? {},
        android: { priority: payload.highPriority ? 'high' : 'normal' },
        apns: payload.highPriority
          ? { headers: { 'apns-priority': '10' } }
          : undefined,
      };
      await admin.messaging(this.fcmApp).send(msg);
      this.logger.debug({ event: 'fcm_sent', token: payload.token.slice(0, 8) });
      return true;
    } catch (err) {
      this.logger.error({ event: 'fcm_send_failed', err });
      return false;
    }
  }

  async sendVoip(payload: VoipPayload): Promise<boolean> {
    if (!this.apnsEnabled) {
      this.logger.log({
        event: 'apns_voip_stub',
        voipToken: payload.voipToken.slice(0, 8) + '...',
        callId: payload.callId,
        callerName: payload.callerName,
      });
      return true;
    }
    // Real APNs VoIP push would be implemented here
    this.logger.log({ event: 'apns_voip_send', callId: payload.callId });
    return true;
  }

  isFcmEnabled(): boolean { return this.fcmEnabled; }
  isApnsEnabled(): boolean { return this.apnsEnabled; }
}
