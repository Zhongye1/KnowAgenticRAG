import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, FlatList, StyleSheet,
  Alert, ActivityIndicator, TextInput, Modal, ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import { useKbStore } from '../store/useKbStore';
import { api } from '../utils/api';
import { COLORS, FONTS, RADIUS, SPACING } from '../constants/theme';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

type Props = NativeStackScreenProps<any, 'KnowledgeDetail'>;

interface DocItem {
  id: string;
  name: string;
  size: number;
  status: 'processing' | 'done' | 'error';
  created_at: string;
}

export default function KnowledgeDetailScreen({ route, navigation }: Props) {
  const { kbId, kbName } = route.params as { kbId: string; kbName: string };
  const [docs, setDocs] = useState<DocItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [showUrlModal, setShowUrlModal] = useState(false);
  const [urlInput, setUrlInput] = useState('');
  const [urlLoading, setUrlLoading] = useState(false);

  useEffect(() => {
    navigation.setOptions({ title: kbName });
    fetchDocs();
  }, [kbId]);

  const fetchDocs = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get(`/api/knowledge-bases/${kbId}/documents`);
      setDocs(res.data?.documents ?? res.data ?? []);
    } catch {
      Alert.alert('加载失败', '无法获取文档列表');
    } finally {
      setLoading(false);
    }
  }, [kbId]);

  const handleUpload = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/pdf', 'text/*', 'application/msword',
               'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
        multiple: true,
      });
      if (result.canceled) return;
      setUploading(true);

      for (const file of result.assets) {
        const formData = new FormData();
        formData.append('file', {
          uri: file.uri,
          name: file.name,
          type: file.mimeType ?? 'application/octet-stream',
        } as any);
        formData.append('kb_id', kbId);
        await api.post('/api/upload', formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
      }
      await fetchDocs();
      Alert.alert('上传成功', `已上传 ${result.assets.length} 个文件`);
    } catch (e: any) {
      Alert.alert('上传失败', e.message);
    } finally {
      setUploading(false);
    }
  };

  const handleImportUrl = async () => {
    const urls = urlInput.split('\n').map(u => u.trim()).filter(Boolean);
    if (urls.length === 0) return;
    setUrlLoading(true);
    try {
      await api.post('/api/knowledge-bases/import-urls', { kb_id: kbId, urls });
      setShowUrlModal(false);
      setUrlInput('');
      await fetchDocs();
      Alert.alert('导入成功', `已提交 ${urls.length} 个 URL`);
    } catch (e: any) {
      Alert.alert('导入失败', e.response?.data?.detail ?? e.message);
    } finally {
      setUrlLoading(false);
    }
  };

  const handleDeleteDoc = (docId: string, docName: string) => {
    Alert.alert('删除文档', `确定删除「${docName}」？`, [
      { text: '取消', style: 'cancel' },
      {
        text: '删除', style: 'destructive',
        onPress: async () => {
          try {
            await api.delete(`/api/knowledge-bases/${kbId}/documents/${docId}`);
            setDocs(prev => prev.filter(d => d.id !== docId));
          } catch {
            Alert.alert('删除失败');
          }
        },
      },
    ]);
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  };

  const statusColor = (status: DocItem['status']) => ({
    done: COLORS.success, processing: COLORS.warning, error: COLORS.danger,
  }[status] ?? COLORS.textMuted);

  const statusLabel = (status: DocItem['status']) => ({
    done: '已就绪', processing: '向量化中', error: '处理失败',
  }[status] ?? status);

  const renderDoc = ({ item }: { item: DocItem }) => (
    <View style={styles.docItem}>
      <View style={styles.docIcon}>
        <Ionicons name="document-text-outline" size={20} color={COLORS.primary} />
      </View>
      <View style={styles.docInfo}>
        <Text style={styles.docName} numberOfLines={2}>{item.name}</Text>
        <Text style={styles.docMeta}>
          {formatSize(item.size)} · {new Date(item.created_at).toLocaleDateString()}
        </Text>
      </View>
      <View style={styles.docActions}>
        <View style={[styles.statusBadge, { borderColor: statusColor(item.status) }]}>
          <Text style={[styles.statusText, { color: statusColor(item.status) }]}>
            {statusLabel(item.status)}
          </Text>
        </View>
        <TouchableOpacity onPress={() => handleDeleteDoc(item.id, item.name)} style={styles.deleteBtn}>
          <Ionicons name="trash-outline" size={16} color={COLORS.danger} />
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      {/* 操作栏 */}
      <View style={styles.actionBar}>
        <TouchableOpacity
          style={[styles.actionBtn, uploading && styles.actionBtnDisabled]}
          onPress={handleUpload} disabled={uploading}
        >
          {uploading
            ? <ActivityIndicator size="small" color="white" />
            : <Ionicons name="cloud-upload-outline" size={16} color="white" />}
          <Text style={styles.actionBtnText}>{uploading ? '上传中...' : '上传文件'}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.actionBtn, styles.actionBtnSecondary]}
          onPress={() => setShowUrlModal(true)}
        >
          <Ionicons name="link-outline" size={16} color={COLORS.primary} />
          <Text style={[styles.actionBtnText, styles.actionBtnTextSecondary]}>URL 导入</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.actionBtn, styles.actionBtnSecondary]}
          onPress={() => navigation.navigate('Chat', { kbId })}
        >
          <Ionicons name="chatbubble-ellipses-outline" size={16} color={COLORS.primary} />
          <Text style={[styles.actionBtnText, styles.actionBtnTextSecondary]}>RAG 问答</Text>
        </TouchableOpacity>
      </View>

      {/* 文档列表 */}
      {loading ? (
        <View style={styles.center}><ActivityIndicator color={COLORS.primary} size="large" /></View>
      ) : (
        <FlatList
          data={docs}
          keyExtractor={item => item.id}
          renderItem={renderDoc}
          contentContainerStyle={styles.list}
          ListHeaderComponent={
            <Text style={styles.listHeader}>{docs.length} 个文档</Text>
          }
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="folder-open-outline" size={48} color={COLORS.border} />
              <Text style={styles.emptyText}>暂无文档，点击「上传文件」或「URL 导入」添加</Text>
            </View>
          }
          onRefresh={fetchDocs}
          refreshing={loading}
        />
      )}

      {/* URL 导入 Modal */}
      <Modal visible={showUrlModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>批量 URL 导入</Text>
              <TouchableOpacity onPress={() => setShowUrlModal(false)}>
                <Ionicons name="close" size={22} color={COLORS.text} />
              </TouchableOpacity>
            </View>
            <Text style={styles.modalDesc}>每行一个 URL，支持网页、在线 PDF</Text>
            <TextInput
              style={styles.urlTextarea}
              value={urlInput}
              onChangeText={setUrlInput}
              placeholder={'https://example.com/doc1\nhttps://example.com/doc2'}
              placeholderTextColor={COLORS.textMuted}
              multiline
              numberOfLines={6}
              textAlignVertical="top"
            />
            <TouchableOpacity
              style={[styles.actionBtn, urlLoading && styles.actionBtnDisabled, { marginTop: 12 }]}
              onPress={handleImportUrl} disabled={urlLoading}
            >
              {urlLoading
                ? <ActivityIndicator size="small" color="white" />
                : <Ionicons name="download-outline" size={16} color="white" />}
              <Text style={styles.actionBtnText}>{urlLoading ? '导入中...' : '开始导入'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  actionBar: {
    flexDirection: 'row', gap: 8, padding: SPACING.md,
    backgroundColor: COLORS.card, borderBottomWidth: 1, borderBottomColor: COLORS.border,
    flexWrap: 'wrap',
  },
  actionBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: COLORS.primary, borderRadius: RADIUS.sm,
    paddingHorizontal: 12, paddingVertical: 8,
  },
  actionBtnSecondary: {
    backgroundColor: COLORS.primary + '15',
    borderWidth: 1, borderColor: COLORS.primary + '40',
  },
  actionBtnDisabled: { opacity: 0.6 },
  actionBtnText: { fontSize: 13, color: 'white', fontWeight: '600' },
  actionBtnTextSecondary: { color: COLORS.primary },
  list: { padding: SPACING.md, gap: SPACING.sm },
  listHeader: { fontSize: 13, color: COLORS.textMuted, marginBottom: 4 },
  docItem: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 10,
    backgroundColor: COLORS.card, borderRadius: RADIUS.md, padding: SPACING.md,
    borderWidth: 1, borderColor: COLORS.border,
  },
  docIcon: {
    width: 36, height: 36, borderRadius: RADIUS.sm,
    backgroundColor: COLORS.primary + '15', alignItems: 'center', justifyContent: 'center',
  },
  docInfo: { flex: 1 },
  docName: { fontSize: 14, color: COLORS.text, fontWeight: '500', lineHeight: 20 },
  docMeta: { fontSize: 12, color: COLORS.textMuted, marginTop: 3 },
  docActions: { alignItems: 'flex-end', gap: 8 },
  statusBadge: {
    borderWidth: 1, borderRadius: 10, paddingHorizontal: 6, paddingVertical: 2,
  },
  statusText: { fontSize: 11, fontWeight: '500' },
  deleteBtn: { padding: 4 },
  empty: { alignItems: 'center', justifyContent: 'center', paddingTop: 60, gap: 12 },
  emptyText: { color: COLORS.textMuted, fontSize: 14, textAlign: 'center', paddingHorizontal: SPACING.xl },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  modalSheet: {
    backgroundColor: 'white', borderTopLeftRadius: 16, borderTopRightRadius: 16,
    padding: SPACING.md, paddingBottom: 32,
  },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  modalTitle: { fontSize: 16, fontWeight: '700', color: COLORS.text },
  modalDesc: { fontSize: 13, color: COLORS.textMuted, marginBottom: 12 },
  urlTextarea: {
    borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.md,
    padding: SPACING.sm, fontSize: 13, color: COLORS.text, height: 120,
  },
});
