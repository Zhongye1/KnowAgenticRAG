import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { COLORS, RADIUS, SPACING } from '../constants/theme';

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  sources?: { title: string; score?: number }[];
  streaming?: boolean;
}

interface Props { message: Message }

export default function MessageBubble({ message }: Props) {
  const isUser = message.role === 'user';

  return (
    <View style={[styles.row, isUser ? styles.rowUser : styles.rowAssistant]}>
      {!isUser && (
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>AI</Text>
        </View>
      )}
      <View style={[styles.bubble, isUser ? styles.bubbleUser : styles.bubbleAssistant]}>
        <Text style={[styles.text, isUser ? styles.textUser : styles.textAssistant]}>
          {message.content}
        </Text>
        {message.streaming && (
          <View style={styles.cursorRow}>
            <View style={styles.cursor} />
          </View>
        )}
        {/* 引用来源 */}
        {!isUser && message.sources && message.sources.length > 0 && (
          <View style={styles.sources}>
            <Text style={styles.sourcesTitle}>📎 引用来源</Text>
            {message.sources.map((s, i) => (
              <View key={i} style={styles.sourceItem}>
                <Text style={styles.sourceDot}>·</Text>
                <Text style={styles.sourceText} numberOfLines={1}>{s.title}</Text>
                {s.score != null && (
                  <Text style={styles.sourceScore}>{(s.score * 100).toFixed(0)}%</Text>
                )}
              </View>
            ))}
          </View>
        )}
      </View>
      {isUser && (
        <View style={[styles.avatar, styles.userAvatar]}>
          <Text style={styles.avatarText}>我</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 12, gap: 8 },
  rowUser: { justifyContent: 'flex-end' },
  rowAssistant: { justifyContent: 'flex-start' },
  avatar: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: COLORS.primary + 'cc',
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  userAvatar: { backgroundColor: '#e5e7eb' },
  avatarText: { fontSize: 11, fontWeight: '700', color: 'white' },
  bubble: {
    maxWidth: '78%', borderRadius: RADIUS.md, padding: SPACING.sm,
  },
  bubbleUser: {
    backgroundColor: COLORS.primary,
    borderBottomRightRadius: 4,
  },
  bubbleAssistant: {
    backgroundColor: COLORS.card,
    borderWidth: 1, borderColor: COLORS.border,
    borderBottomLeftRadius: 4,
  },
  text: { fontSize: 15, lineHeight: 22 },
  textUser: { color: 'white' },
  textAssistant: { color: COLORS.text },
  cursorRow: { marginTop: 4 },
  cursor: {
    width: 8, height: 14, borderRadius: 1,
    backgroundColor: COLORS.primary, opacity: 0.7,
  },
  sources: {
    marginTop: 10, paddingTop: 8,
    borderTopWidth: 1, borderTopColor: COLORS.border + '80',
  },
  sourcesTitle: { fontSize: 11, fontWeight: '700', color: COLORS.textMuted, marginBottom: 4 },
  sourceItem: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 2 },
  sourceDot: { color: COLORS.textMuted, fontSize: 12 },
  sourceText: { flex: 1, fontSize: 12, color: '#1d4ed8' },
  sourceScore: {
    fontSize: 10, color: 'white',
    backgroundColor: COLORS.primary + 'cc', borderRadius: 8,
    paddingHorizontal: 5, paddingVertical: 1,
  },
});
