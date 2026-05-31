import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:provider/provider.dart';

import 'package:nova_chat_client/models/message.dart';
import 'package:nova_chat_client/providers/chat_provider.dart';
import 'package:nova_chat_client/providers/auth_provider.dart';

// ── Helpers ────────────────────────────────────────────────────────────────

Message makeMsg({
  String id = 'msg-1',
  String senderId = 'user-1',
  String type = 'text',
  String? content = 'Salom',
  DateTime? createdAt,
}) =>
    Message(
      id: id,
      roomId: 'room-1',
      senderId: senderId,
      type: type,
      content: content,
      createdAt: createdAt ?? DateTime(2026, 5, 1, 10, 30),
    );

Widget testApp(Widget child) => MultiProvider(
      providers: [
        ChangeNotifierProvider(create: (_) => AuthProvider()),
        ChangeNotifierProvider(create: (_) => ChatProvider()),
      ],
      child: MaterialApp(home: child),
    );

// ── Main ────────────────────────────────────────────────────────────────────

void main() {
  // ── Message model ──────────────────────────────────────────────────────

  group('Message model', () {
    test('fromJson parses text message', () {
      final json = {
        'id': 'abc',
        'roomId': 'room-1',
        'senderId': 'user-1',
        'type': 'text',
        'content': 'Salom dunyo',
        'createdAt': '2026-05-01T10:30:00.000Z',
      };
      final msg = Message.fromJson(json);
      expect(msg.id, 'abc');
      expect(msg.content, 'Salom dunyo');
      expect(msg.type, 'text');
      expect(msg.isSystem, isFalse);
    });

    test('isSystem true for system type', () {
      final msg = makeMsg(type: 'system', content: '{"uz":"Xona yaratildi"}');
      expect(msg.isSystem, isTrue);
    });

    test('localizedContent returns correct locale', () {
      final msg = makeMsg(
          type: 'system',
          content: '{"uz":"Xona yaratildi","ru":"Комната создана"}');
      expect(msg.localizedContent('uz'), 'Xona yaratildi');
      expect(msg.localizedContent('ru'), 'Комната создана');
    });

    test('localizedContent returns raw content if not JSON', () {
      final msg = makeMsg(type: 'system', content: 'Oddiy matn');
      expect(msg.localizedContent('uz'), 'Oddiy matn');
    });

    test('isSystem false for image type', () {
      final msg = makeMsg(type: 'image', content: 'attachment-id-123');
      expect(msg.isSystem, isFalse);
    });

    test('createdAt parses ISO string correctly', () {
      final msg = Message.fromJson({
        'id': '1',
        'roomId': 'r',
        'senderId': 's',
        'type': 'text',
        'content': 'x',
        'createdAt': '2026-01-15T08:45:00.000Z',
      });
      expect(msg.createdAt.year, 2026);
      expect(msg.createdAt.month, 1);
      expect(msg.createdAt.day, 15);
    });
  });

  // ── ChatProvider ───────────────────────────────────────────────────────

  group('ChatProvider', () {
    late ChatProvider provider;

    setUp(() => provider = ChatProvider());

    test('starts empty', () {
      expect(provider.messages, isEmpty);
      expect(provider.unreadCount, 0);
      expect(provider.activeRoom, isNull);
      expect(provider.loadingMessages, isFalse);
    });

    test('addMessage adds one message', () {
      provider.addMessage(makeMsg());
      expect(provider.messages.length, 1);
      expect(provider.messages.first.id, 'msg-1');
    });

    test('addMessage deduplicates by id', () {
      provider.addMessage(makeMsg(id: 'dup'));
      provider.addMessage(makeMsg(id: 'dup'));
      expect(provider.messages.length, 1);
    });

    test('addMessage sorts chronologically', () {
      final older = makeMsg(id: 'old', createdAt: DateTime(2026, 1, 1, 9, 0));
      final newer = makeMsg(id: 'new', createdAt: DateTime(2026, 1, 1, 11, 0));
      provider.addMessage(newer);
      provider.addMessage(older);
      expect(provider.messages.first.id, 'old');
      expect(provider.messages.last.id, 'new');
    });

    test('unreadCount increments', () {
      expect(provider.unreadCount, 0);
      provider.incrementUnread();
      provider.incrementUnread();
      provider.incrementUnread();
      expect(provider.unreadCount, 3);
    });

    test('clearUnread resets to 0', () {
      provider.incrementUnread();
      provider.incrementUnread();
      provider.clearUnread();
      expect(provider.unreadCount, 0);
    });

    test('clear resets everything', () {
      provider.addMessage(makeMsg(id: '1'));
      provider.addMessage(makeMsg(id: '2'));
      provider.incrementUnread();
      provider.clear();
      expect(provider.messages, isEmpty);
      expect(provider.unreadCount, 0);
      expect(provider.activeRoom, isNull);
      expect(provider.supportRoomId, isNull);
    });

    test('multiple messages added in order', () {
      for (int i = 1; i <= 5; i++) {
        provider.addMessage(makeMsg(
          id: 'msg-$i',
          createdAt: DateTime(2026, 1, 1, i, 0),
        ));
      }
      expect(provider.messages.length, 5);
      for (int i = 0; i < 5; i++) {
        expect(provider.messages[i].id, 'msg-${i + 1}');
      }
    });
  });

  // ── Widget smoke tests ─────────────────────────────────────────────────

  group('Smoke tests', () {
    testWidgets('MaterialApp wraps correctly', (tester) async {
      await tester.pumpWidget(
        testApp(const Scaffold(body: Text('Nova Chat Test'))),
      );
      expect(find.text('Nova Chat Test'), findsOneWidget);
    });

    testWidgets('Scaffold renders without crash', (tester) async {
      await tester.pumpWidget(
        testApp(Scaffold(
          appBar: AppBar(title: const Text('Test')),
          body: ListView(children: [
            const ListTile(title: Text('Item 1')),
            const ListTile(title: Text('Item 2')),
          ]),
        )),
      );
      expect(find.text('Item 1'), findsOneWidget);
      expect(find.text('Item 2'), findsOneWidget);
    });
  });
}
