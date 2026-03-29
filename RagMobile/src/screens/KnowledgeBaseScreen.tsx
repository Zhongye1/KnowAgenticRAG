import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  Alert,
  ActivityIndicator,
  TextInput,
  Modal,
  RefreshControl,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { useKbStore } from "../store/useKbStore";
import { COLORS, FONTS, RADIUS, SPACING, SHADOW } from "../constants/theme";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";

type Props = NativeStackScreenProps<any, "KnowledgeBase">;

export default function KnowledgeBaseScreen({ navigation }: Props) {
  const {
    knowledgeBases,
    loading,
    fetchKnowledgeBases,
    createKnowledgeBase,
    deleteKnowledgeBase,
    toggleStar,
  } = useKbStore();
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [creating, setCreating] = useState(false);

  // 页面聚焦时刷新
  useFocusEffect(
    useCallback(() => {
      fetchKnowledgeBases();
    }, []),
  );

  const handleCreate = async () => {
    if (!newName.trim()) {
      Alert.alert("请填写知识库名称");
      return;
    }
    setCreating(true);
    try {
      await createKnowledgeBase(newName.trim(), newDesc.trim());
      setShowCreate(false);
      setNewName("");
      setNewDesc("");
    } catch (e: any) {
      Alert.alert("创建失败", e.response?.data?.detail ?? e.message);
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = (id: string, name: string) => {
    Alert.alert("删除知识库", `确定删除「${name}」？此操作不可撤销。`, [
      { text: "取消", style: "cancel" },
      {
        text: "删除",
        style: "destructive",
        onPress: () =>
          deleteKnowledgeBase(id).catch((e) =>
            Alert.alert("删除失败", e.message),
          ),
      },
    ]);
  };

  const renderItem = ({
    item,
  }: {
    item: ReturnType<typeof useKbStore.getState>["knowledgeBases"][0];
  }) => (
    <TouchableOpacity
      style={styles.card}
      onPress={() =>
        navigation.navigate("KnowledgeDetail", {
          kbId: item.id,
          kbName: item.name,
        })
      }
      activeOpacity={0.85}
    >
      <View style={[styles.cardAccent, { backgroundColor: item.color }]} />
      <View style={styles.cardBody}>
        <View style={styles.cardHeader}>
          <Text style={styles.cardTitle} numberOfLines={1}>
            {item.name}
          </Text>
          <View style={styles.cardActions}>
            <TouchableOpacity onPress={() => toggleStar(item.id)} hitSlop={8}>
              <Ionicons
                name={item.is_starred ? "star" : "star-outline"}
                size={18}
                color={item.is_starred ? "#f59e0b" : COLORS.textMuted}
              />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => handleDelete(item.id, item.name)}
              hitSlop={8}
              style={{ marginLeft: 10 }}
            >
              <Ionicons
                name="trash-outline"
                size={16}
                color={COLORS.textMuted}
              />
            </TouchableOpacity>
          </View>
        </View>
        {item.description ? (
          <Text style={styles.cardDesc} numberOfLines={2}>
            {item.description}
          </Text>
        ) : null}
        <View style={styles.cardFooter}>
          <View style={styles.cardStat}>
            <Ionicons
              name="document-text-outline"
              size={13}
              color={COLORS.textMuted}
            />
            <Text style={styles.cardStatText}>{item.doc_count ?? 0} 文档</Text>
          </View>
          {item.updated_at && (
            <Text style={styles.cardTime}>
              {new Date(item.updated_at).toLocaleDateString("zh-CN")}
            </Text>
          )}
          <TouchableOpacity
            style={styles.chatBtn}
            onPress={() => navigation.navigate("Chat", { kbId: item.id })}
          >
            <Ionicons
              name="chatbubble-ellipses-outline"
              size={13}
              color={COLORS.primary}
            />
            <Text style={styles.chatBtnText}>问答</Text>
          </TouchableOpacity>
        </View>
      </View>
    </TouchableOpacity>
  );

  const starred = knowledgeBases.filter((k) => k.is_starred);
  const rest = knowledgeBases.filter((k) => !k.is_starred);
  const sortedList = [...starred, ...rest];

  return (
    <SafeAreaView style={styles.container} edges={["bottom"]}>
      <FlatList
        data={sortedList}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          knowledgeBases.length > 0 ? (
            <Text style={styles.listHeader}>
              {knowledgeBases.length} 个知识库
            </Text>
          ) : null
        }
        ListEmptyComponent={
          !loading ? (
            <View style={styles.empty}>
              <Ionicons
                name="library-outline"
                size={56}
                color={COLORS.border}
              />
              <Text style={styles.emptyTitle}>还没有知识库</Text>
              <Text style={styles.emptyDesc}>
                点击右上角「+」创建第一个知识库
              </Text>
            </View>
          ) : null
        }
        refreshControl={
          <RefreshControl
            refreshing={loading}
            onRefresh={fetchKnowledgeBases}
            tintColor={COLORS.primary}
          />
        }
      />

      {/* 新建 Modal */}
      <Modal visible={showCreate} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>新建知识库</Text>
              <TouchableOpacity onPress={() => setShowCreate(false)}>
                <Ionicons name="close" size={22} color={COLORS.text} />
              </TouchableOpacity>
            </View>
            <Text style={styles.fieldLabel}>名称 *</Text>
            <TextInput
              style={styles.input}
              value={newName}
              onChangeText={setNewName}
              placeholder="我的知识库"
              placeholderTextColor={COLORS.textMuted}
              autoFocus
            />
            <Text style={[styles.fieldLabel, { marginTop: 12 }]}>
              描述（可选）
            </Text>
            <TextInput
              style={[styles.input, { height: 72 }]}
              value={newDesc}
              onChangeText={setNewDesc}
              placeholder="用途简介..."
              placeholderTextColor={COLORS.textMuted}
              multiline
              textAlignVertical="top"
            />
            <TouchableOpacity
              style={[styles.createBtn, creating && styles.createBtnDisabled]}
              onPress={handleCreate}
              disabled={creating}
            >
              {creating ? (
                <ActivityIndicator size="small" color="white" />
              ) : (
                <Ionicons name="add" size={18} color="white" />
              )}
              <Text style={styles.createBtnText}>
                {creating ? "创建中..." : "创建"}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* FAB */}
      <TouchableOpacity style={styles.fab} onPress={() => setShowCreate(true)}>
        <Ionicons name="add" size={28} color="white" />
      </TouchableOpacity>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  list: { padding: SPACING.md, gap: SPACING.sm, paddingBottom: 80 },
  listHeader: { fontSize: 13, color: COLORS.textMuted, marginBottom: 4 },
  card: {
    backgroundColor: COLORS.card,
    borderRadius: RADIUS.lg,
    flexDirection: "row",
    overflow: "hidden",
    borderWidth: 1,
    borderColor: COLORS.border,
    ...SHADOW.sm,
  },
  cardAccent: { width: 4 },
  cardBody: { flex: 1, padding: SPACING.md },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  cardTitle: { ...FONTS.title, fontSize: 15, flex: 1, marginRight: 8 },
  cardActions: { flexDirection: "row", alignItems: "center" },
  cardDesc: {
    fontSize: 13,
    color: COLORS.textMuted,
    marginTop: 4,
    lineHeight: 18,
  },
  cardFooter: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 10,
    gap: 8,
  },
  cardStat: { flexDirection: "row", alignItems: "center", gap: 3 },
  cardStatText: { fontSize: 12, color: COLORS.textMuted },
  cardTime: { fontSize: 11, color: COLORS.textMuted, marginLeft: "auto" },
  chatBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: COLORS.primary + "15",
    borderRadius: RADIUS.sm,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  chatBtnText: { fontSize: 12, color: COLORS.primary, fontWeight: "500" },
  empty: {
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 80,
    gap: 10,
  },
  emptyTitle: { ...FONTS.title, fontSize: 17, color: COLORS.textMuted },
  emptyDesc: { fontSize: 13, color: COLORS.textMuted, textAlign: "center" },
  fab: {
    position: "absolute",
    right: 20,
    bottom: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: COLORS.primary,
    alignItems: "center",
    justifyContent: "center",
    ...SHADOW.md,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "flex-end",
  },
  modalSheet: {
    backgroundColor: "white",
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: SPACING.md,
    paddingBottom: 36,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  modalTitle: { fontSize: 16, fontWeight: "700", color: COLORS.text },
  fieldLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: COLORS.textMuted,
    marginBottom: 6,
  },
  input: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.sm,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 14,
    color: COLORS.text,
  },
  createBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: COLORS.primary,
    borderRadius: RADIUS.sm,
    paddingVertical: 12,
    marginTop: 16,
  },
  createBtnDisabled: { opacity: 0.6 },
  createBtnText: { color: "white", fontWeight: "700", fontSize: 15 },
});
