## Performance optimization

- ACD operator selection: hozir DB'dan qidiradi (chat-service va 
  call-service). Phase 11 load test'da 'operator:available' Redis 
  ZSET'ga ko'chirish kerak (spec Section 7.5).
