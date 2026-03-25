import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, FlatList,
  StyleSheet, KeyboardAvoidingView, Platform, ActivityIndicator,
  Alert, Switch, ScrollView, Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useChatStore } from '../store/useChatStore';
import { useKbStore } from '../store/useKbStore';
import { COLORS, FONTS, RADIUS, SPACING } from '../constants/theme';
import VoiceButton from '../components/VoiceButton';
import MessageBubble from '../components/MessageBubble';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

type Props = NativeStackScreenProps<any, 'Chat'>;

export default function ChatScreen({ route, navigation }: Props) {
  const sessionId = route.params?.sessionId as string | undefined;
  const initKbId = route.params?.kbId as string | undefined;

  const {
    sessions, currentSessionId, messages, streaming,
    createSession, setCurrentSession, sendMessage, clearMessages,
  } = useChatStore();

  const { knowledgeBases } = useKbStore();

  const [input, setInput] = useState('');
  const [ragMode, setRagMode] = useState(false);
  const [selectedKbId, setSelectedKbId] = useState<string | null>(initKbId ?? null);
  const [showKbPicker, setShowKbPicker] = useState(false);
  const flatListRef = useRef<FlatList>(null);

  // 初始化会话
  useEffect(() => {
    if (sessionId) {
      setCurrentSession(sessionId);
    } else {
      createSession();
    }
  }, []);

  // 设置导航标题
  useEffect(() => {
    const title = ragMode && selectedKbId
      ? `RAG · ${knowledgeBases.find(k => k.id === selectedKbId)?.name ?? '知识库'}`
      : '智能对话';
    navigation.setOptions({ title });
  }, [ragMode, selectedKbId]);

  // 滚动到底部
  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
    }
  }, [messages]);

  const handleSend = useCallback(async () => {
    const text = input.trim();
    if (!text || streaming) return;
    setInput('');
    await sendMessage(text, ragMode ? selectedKbId ?? undefined : undefined);
  }, [input, streaming, ragMode, selectedKbId, sendMessage]);

  const handleVoiceTranscribed = (text: string) => {
    setInput(text);
  };

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={90}
      >
        {/* RAG 模式控制栏 */}
        <View style={styles.ragBar}>
          <Ionicons name="book-outline" size={16} color={COLORS.primary} />
          <Text style={styles.ragLabel}>RAG 知识库问答</Text>
          <Switch
            value={ragMode}
            onValueChange={setRagMode}
            trackColor={{ false: COLORS.border, true: COLORS.primary + '66' }}
            thumbColor={ragMode ? COLORS.primary : '#f4f3f4'}
            style={styles.ragSwitch}
          />
          {ragMode && (
            <TouchableOpacity style={styles.kbPicker} onPress={() => setShowKbPicker(true)}>
              <Text style={styles.kbPickerText} numberOfLines={1}>
                {selectedKbId
                  ? knowledgeBases.find(k => k.id === selectedKbId)?.name ?? '选择知识库'
                  : '选择知识库'}
              </Text>
              <Ionicons name="chevron-down" size={12} color={COLORS.primary} />
            </TouchableOpacity>
          )}
        </View>

        {/* 消息列表 */}
        {messages.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="chatbubbles-outline" size={56} color={COLORS.border} />
            <Text style={styles.emptyTitle}>开始对话</Text>
            <Text style={styles.emptyDesc}>
              {ragMode ? '已开启 RAG 模式，将从知识库中检索答案' : '直接问我任何问题'}
            </Text>
          </View>
        ) : (
          <FlatList
            ref={flatListRef}
            data={messages}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => <MessageBubble message={item} />}
            contentContainerStyle={styles.messageList}
            showsVerticalScrollIndicator={false}
            onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
          />
        )}

        {/* 正在生成提示 */}
        {streaming && (
          <View style={styles.streamingHint}>
            <ActivityIndicator size="small" color={COLORS.primary} />
            <Text style={styles.streamingText}>正在生成...</Text>
          </View>
        )}

        {/* 输入栏 */}
        <View style={styles.inputBar}>
          <VoiceButton onTranscribed={handleVoiceTranscribed} />
          <TextInput
            style={styles.input}
            value={input}
            onChangeText={setInput}
            placeholder={ragMode ? '基于知识库提问...' : '输入消息...'}
            placeholderTextColor={COLORS.textMuted}
            multiline
            maxLength={2000}
            onSubmitEditing={handleSend}
          />
          <TouchableOpacity
            style={[styles.sendBtn, (!input.trim() || streaming) && styles.sendBtnDisabled]}
            onPress={handleSend}
            disabled={!input.trim() || streaming}
          >
            <Ionicons
              name={streaming ? 'ellipsis-horizontal' : 'send'}
              size={18}
              color="white"
            />
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>

      {/* 知识库选择器 Modal */}
      <Modal visible={showKbPicker} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>选择知识库</Text>
              <TouchableOpacity onPress={() => setShowKbPicker(false)}>
                <Ionicons name="close" size={22} color={COLORS.text} />
              </TouchableOpacity>
            </View>
            <ScrollView>
              {knowledgeBases.map((kb) => (
                <TouchableOpacity
                  key={kb.id}
                  style={[styles.kbOption, selectedKbId === kb.id && styles.kbOptionSelected]}
                  onPress={() => { setSelectedKbId(kb.id); setShowKbPicker(false); }}
                >
                  <View style={[styles.kbDot, { backgroundColor: kb.color ?? COLORS.primary }]} />
                  <Text style={styles.kbOptionText}>{kb.name}</Text>
                  {selectedKbId === kb.id && (
                    <Ionicons name="checkmark" size={18} color={COLORS.primary} />
                  )}
                </TouchableOpacity>
              ))}
              {knowledgeBases.length === 0 && (
                <Text style={styles.noKb}>暂无知识库，请先在「知识库」页面创建</Text>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  flex: { flex: 1 },
  ragBar: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: SPACING.md, paddingVertical: 8,
    backgroundColor: COLORS.card, borderBottomWidth: 1, borderBottomColor: COLORS.border,
    gap: 6,
  },
  ragLabel: { fontSize: 13, color: COLORS.textMuted, flex: 0 },
  ragSwitch: { marginLeft: 'auto' },
  kbPicker: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: COLORS.primary + '15', borderRadius: RADIUS.sm,
    paddingHorizontal: 8, paddingVertical: 3,
  },
  kbPickerText: { fontSize: 12, color: COLORS.primary, maxWidth: 100 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: SPACING.xl },
  emptyTitle: { ...FONTS.title, fontSize: 18, color: COLORS.textMuted, marginTop: 12 },
  emptyDesc: { ...FONTS.body, color: COLORS.textMuted, textAlign: 'center', marginTop: 6, lineHeight: 20 },
  messageList: { padding: SPACING.md, paddingBottom: 8 },
  streamingHint: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    padding: 8, paddingHorizontal: SPACING.md,
    backgroundColor: COLORS.primary + '10',
  },
  streamingText: { fontSize: 12, color: COLORS.primary },
  inputBar: {
    flexDirection: 'row', alignItems: 'flex-end',
    padding: SPACING.sm, paddingHorizontal: SPACING.md,
    backgroundColor: COLORS.card, borderTopWidth: 1, borderTopColor: COLORS.border,
    gap: 8,
  },
  input: {
    flex: 1, backgroundColor: COLORS.background,
    borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.md,
    paddingHorizontal: 12, paddingVertical: 8,
    fontSize: 15, color: COLORS.text, maxHeight: 100,
  },
  sendBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: COLORS.primary,
    alignItems: 'center', justifyContent: 'center',
  },
  sendBtnDisabled: { backgroundColor: COLORS.border },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  modalSheet: {
    backgroundColor: 'white', borderTopLeftRadius: 16, borderTopRightRadius: 16,
    maxHeight: '60%', padding: SPACING.md,
  },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  modalTitle: { ...FONTS.title, fontSize: 16 },
  kbOption: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 12, paddingHorizontal: 4,
    borderBottomWidth: 1, borderBottomColor: COLORS.border,
  },
  kbOptionSelected: { backgroundColor: COLORS.primary + '08' },
  kbDot: { width: 10, height: 10, borderRadius: 5 },
  kbOptionText: { flex: 1, fontSize: 14, color: COLORS.text },
  noKb: { textAlign: 'center', color: COLORS.textMuted, padding: SPACING.lg, fontSize: 14 },
});
