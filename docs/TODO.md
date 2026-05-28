## Performance optimization

- ACD operator selection: hozir DB'dan qidiradi (chat-service va 
  call-service). Phase 11 load test'da 'operator:available' Redis 
  ZSET'ga ko'chirish kerak (spec Section 7.5).

## LiveKit Windows/Production setup

- Windows Docker Desktop'da network_mode: host konteyner-ichidan
  ko'rinmaydi. createRoom/removeParticipant/Egress dev'da warning beradi.
- generateToken ishlaydi (lokal JWT — network shart emas).
- Phase 9-10 (real audio call test) yoki production'da:
  * Variant A: LiveKit'ni bridge network + port mapping (7880, 7881/tcp,
    50000-50100/udp) + LIVEKIT_NODE_IP=<host-ip> config'da
  * Variant B: LiveKit'ni alohida server/VM'da ishga tushirish
- To'liq audio call test Phase 9 (Nova 2 brauzer) yoki Phase 10 (Flutter)'da.
