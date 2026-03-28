import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, FlatList,
  ActivityIndicator, TextInput, Alert, Animated,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../utils/api';
import { COLORS, FONTS, RADIUS, SPACING } from '../constants/theme';

interface AgentStep {
  id: string;
  type: 'thought' | 'action' | 'observation' | 'answer';
  content: string;
  tool?: string;
  timestamp: number;
}

interface AgentTask {
  id: string;
  query: string;
  status: 'running' | 'done' | 'error';
  steps: AgentStep[];
  createdAt: number;
}

const STEP_ICONS: Record<AgentStep['type'], string> = {
  thought: 'bulb-outline',
  action: 'play-circle-outline',
  observation: 'eye-outline',
  answer: 'checkmark-circle-outline',
};

const STEP_COLORS: Record<AgentStep['type'], string> = {
  thought: '#f59e0b',
  action: '#3b82f6',
  observation: '#8b5cf6',
  answer: '#10b981',
};

export default function AgentScreen() {
  const [query, setQuery] = useState('');
  const [tasks, setTasks] = useState<AgentTask[]>([]);
  const [activeTask, setActiveTask] = useState<AgentTask | null>(null);
  const [running, setRunning] = useState(false);
  const [enableWebSearch, setEnableWebSearch] = useState(false);
  const pulseAnim = useRef(new Animated.Value(1)).current;

  // 脉冲动画
  useEffect(() => {
    if (running) {
      const anim = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.3, duration: 600, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
        ])
      );
      anim.start();
      return () => anim.stop();
    }
  }, [running]);

  const handleRun = async () => {
    const q = query.trim();
    if (!q || running) return;
    setQuery('');
    setRunning(true);

    const taskId = Date.now().toString();
    const newTask: AgentTask = {
      id: taskId,
      query: q,
      status: 'running',
      steps: [],
      createdAt: Date.now(),
    };
    setActiveTask(newTask);
    setTasks(prev => [newTask, ...prev]);

    try {
      // SSE 流式接收 Agent 步骤
      const response = await fetch(
        `${(api.defaults.baseURL ?? 'http://localhost:8000')}/api/agent/run-stream`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: q, enable_web_search: enableWebSearch }),
        }
      );

      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (reader) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            const data = JSON.parse(line.slice(6));
            const step: AgentStep = {
              id: `${taskId}_${Date.now()}`,
              type: data.type ?? 'thought',
              content: data.content ?? data.output ?? '',
              tool: data.tool,
              timestamp: Date.now(),
            };
            setActiveTask(prev => {
              if (!prev) return prev;
              const updated = { ...prev, steps: [...prev.steps, step] };
              setTasks(prevTasks => prevTasks.map(t => t.id === taskId ? updated : t));
              return updated;
            });
          } catch { /* 忽略格式异常 */ }
        }
      }

      setActiveTask(prev => {
        if (!prev) return prev;
        const done = { ...prev, status: 'done' as const };
        setTasks(prevTasks => prevTasks.map(t => t.id === taskId ? done : t));
        return done;
      });
    } catch (e: any) {
      setActiveTask(prev => {
        if (!prev) return prev;
        const errStep: AgentStep = {
          id: `${taskId}_err`,
          type: 'answer',
          content: `任务失败：${e.message}`,
          timestamp: Date.now(),
        };
        const errTask = { ...prev, status: 'error' as const, steps: [...prev.steps, errStep] };
        setTasks(prevTasks => prevTasks.map(t => t.id === taskId ? errTask : t));
        return errTask;
      });
    } finally {
      setRunning(false);
    }
  };

  const renderStep = ({ item }: { item: AgentStep }) => (
    <View style={styles.stepRow}>
      <View style={[styles.stepIcon, { backgroundColor: STEP_COLORS[item.type] + '22' }]}>
        <Ionicons
          name={STEP_ICONS[item.type] as any}
          size={16}
          color={STEP_COLORS[item.type]}
        />
      </View>
      <View style={styles.stepContent}>
        <View style={styles.stepHeader}>
          <Text style={[styles.stepType, { color: STEP_COLORS[item.type] }]}>
            {{ thought: '思考', action: '调用工具', observation: '观察结果', answer: '最终答案' }[item.type]}
          </Text>
          {item.tool && (
            <View style={styles.toolBadge}>
              <Text style={styles.toolText}>{item.tool}</Text>
            </View>
          )}
        </View>
        <Text style={[styles.stepText, item.type === 'answer' && styles.answerText]}>
          {item.content}
        </Text>
      </View>
    </View>
  );

  const renderHistoryItem = ({ item }: { item: AgentTask }) => (
    <TouchableOpacity
      style={[styles.historyItem, activeTask?.id === item.id && styles.historyItemActive]}
      onPress={() => setActiveTask(item)}
    >
      <View style={styles.historyLeft}>
        <Ionicons
          name={item.status === 'done' ? 'checkmark-circle' : item.status === 'error' ? 'close-circle' : 'time-outline'}
          size={16}
          color={item.status === 'done' ? COLORS.success : item.status === 'error' ? COLORS.danger : COLORS.warning}
        />
        <Text style={styles.historyQuery} numberOfLines={1}>{item.query}</Text>
      </View>
      <Text style={styles.historyTime}>
        {new Date(item.createdAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}
      </Text>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      {/* 标题 */}
      <View style={styles.header}>
        <Ionicons name="flash" size={20} color={COLORS.primary} />
        <Text style={styles.headerTitle}>Agent 任务模式</Text>
        {running && (
          <Animated.View style={[styles.runningDot, { transform: [{ scale: pulseAnim }] }]} />
        )}
      </View>

      {/* 当前任务步骤 */}
      <View style={styles.taskView}>
        {activeTask ? (
          <>
            <View style={styles.taskQueryBar}>
              <Ionicons name="help-circle-outline" size={16} color={COLORS.primary} />
              <Text style={styles.taskQuery} numberOfLines={2}>{activeTask.query}</Text>
            </View>
            <FlatList
              data={activeTask.steps}
              keyExtractor={item => item.id}
              renderItem={renderStep}
              contentContainerStyle={styles.stepsList}
              ListEmptyComponent={
                running ? (
                  <View style={styles.waitHint}>
                    <ActivityIndicator color={COLORS.primary} />
                    <Text style={styles.waitText}>Agent 正在分析问题...</Text>
                  </View>
                ) : null
              }
              showsVerticalScrollIndicator={false}
            />
          </>
        ) : (
          <View style={styles.emptyTask}>
            <Ionicons name="rocket-outline" size={48} color={COLORS.border} />
            <Text style={styles.emptyTaskTitle}>多步推理 Agent</Text>
            <Text style={styles.emptyTaskDesc}>
              自动拆解复杂任务，调用知识库检索、联网搜索等工具，逐步推理得出答案
            </Text>
          </View>
        )}
      </View>

      {/* 历史任务 */}
      {tasks.length > 0 && (
        <View style={styles.historySection}>
          <Text style={styles.historySectionTitle}>历史任务</Text>
          <FlatList
            data={tasks}
            keyExtractor={item => item.id}
            renderItem={renderHistoryItem}
            horizontal={false}
            style={styles.historyList}
          />
        </View>
      )}

      {/* 输入区 */}
      <View style={styles.inputArea}>
        <View style={styles.optionRow}>
          <TouchableOpacity
            style={[styles.optionTag, enableWebSearch && styles.optionTagActive]}
            onPress={() => setEnableWebSearch(!enableWebSearch)}
          >
            <Ionicons name="globe-outline" size={13} color={enableWebSearch ? 'white' : COLORS.textMuted} />
            <Text style={[styles.optionTagText, enableWebSearch && styles.optionTagTextActive]}>联网搜索</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.inputRow}>
          <TextInput
            style={styles.input}
            value={query}
            onChangeText={setQuery}
            placeholder="描述你的任务，Agent 会自动拆解步骤..."
            placeholderTextColor={COLORS.textMuted}
            multiline
            maxLength={1000}
          />
          <TouchableOpacity
            style={[styles.runBtn, (!query.trim() || running) && styles.runBtnDisabled]}
            onPress={handleRun}
            disabled={!query.trim() || running}
          >
            {running
              ? <ActivityIndicator size="small" color="white" />
              : <Ionicons name="play" size={20} color="white" />}
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    padding: SPACING.md, backgroundColor: COLORS.card,
    borderBottomWidth: 1, borderBottomColor: COLORS.border,
  },
  headerTitle: { ...FONTS.title, fontSize: 16, flex: 1 },
  runningDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#10b981' },
  taskView: { flex: 1 },
  taskQueryBar: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8,
    padding: SPACING.md, backgroundColor: COLORS.primary + '08',
    borderBottomWidth: 1, borderBottomColor: COLORS.border,
  },
  taskQuery: { flex: 1, fontSize: 14, color: COLORS.text, fontWeight: '500', lineHeight: 20 },
  stepsList: { padding: SPACING.md, gap: 10 },
  stepRow: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  stepIcon: {
    width: 32, height: 32, borderRadius: 16,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  stepContent: { flex: 1 },
  stepHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  stepType: { fontSize: 12, fontWeight: '700' },
  toolBadge: {
    backgroundColor: '#3b82f6' + '20', borderRadius: 4,
    paddingHorizontal: 6, paddingVertical: 1,
  },
  toolText: { fontSize: 11, color: '#3b82f6', fontFamily: 'monospace' },
  stepText: { fontSize: 13, color: COLORS.text, lineHeight: 20 },
  answerText: { fontSize: 14, color: COLORS.text, fontWeight: '500', lineHeight: 22 },
  waitHint: { alignItems: 'center', paddingTop: 40, gap: 12 },
  waitText: { color: COLORS.textMuted, fontSize: 14 },
  emptyTask: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: SPACING.xl },
  emptyTaskTitle: { ...FONTS.title, fontSize: 17, color: COLORS.textMuted, marginTop: 12 },
  emptyTaskDesc: { fontSize: 13, color: COLORS.textMuted, textAlign: 'center', marginTop: 8, lineHeight: 20 },
  historySection: {
    maxHeight: 160, borderTopWidth: 1, borderTopColor: COLORS.border,
    backgroundColor: COLORS.card,
  },
  historySectionTitle: {
    fontSize: 12, color: COLORS.textMuted, fontWeight: '600',
    paddingHorizontal: SPACING.md, paddingTop: 8, paddingBottom: 4,
  },
  historyList: { maxHeight: 120 },
  historyItem: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: SPACING.md, paddingVertical: 8,
    borderBottomWidth: 1, borderBottomColor: COLORS.border,
  },
  historyItemActive: { backgroundColor: COLORS.primary + '10' },
  historyLeft: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 },
  historyQuery: { flex: 1, fontSize: 13, color: COLORS.text },
  historyTime: { fontSize: 11, color: COLORS.textMuted },
  inputArea: {
    padding: SPACING.md, backgroundColor: COLORS.card,
    borderTopWidth: 1, borderTopColor: COLORS.border,
  },
  optionRow: { flexDirection: 'row', gap: 8, marginBottom: 8 },
  optionTag: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    borderWidth: 1, borderColor: COLORS.border, borderRadius: 20,
    paddingHorizontal: 10, paddingVertical: 4,
  },
  optionTagActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  optionTagText: { fontSize: 12, color: COLORS.textMuted },
  optionTagTextActive: { color: 'white' },
  inputRow: { flexDirection: 'row', gap: 8, alignItems: 'flex-end' },
  input: {
    flex: 1, borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.md,
    padding: SPACING.sm, fontSize: 14, color: COLORS.text, maxHeight: 90,
  },
  runBtn: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: COLORS.primary, alignItems: 'center', justifyContent: 'center',
  },
  runBtnDisabled: { backgroundColor: COLORS.border },
});
