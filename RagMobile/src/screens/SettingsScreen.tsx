import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  TextInput,
  Switch,
  Alert,
  ActivityIndicator,
  Linking,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as SecureStore from "expo-secure-store";
import { useAuthStore } from "../store/useAuthStore";
import { api } from "../utils/api";
import { COLORS, FONTS, RADIUS, SPACING } from "../constants/theme";

const MODELS = [
  {
    id: "ollama",
    label: "Ollama（本地）",
    icon: "🦙",
    desc: "本地运行，无需费用",
  },
  { id: "deepseek", label: "DeepSeek", icon: "🔵", desc: "需填写 API Key" },
  { id: "openai", label: "OpenAI GPT", icon: "🟢", desc: "需填写 API Key" },
  { id: "hunyuan", label: "腾讯混元", icon: "🟠", desc: "需填写 SecretId/Key" },
];

type Tab = "model" | "integration" | "account";

export default function SettingsScreen() {
  const { user, logout } = useAuthStore();
  const [activeTab, setActiveTab] = useState<Tab>("model");
  const [selectedModel, setSelectedModel] = useState("ollama");
  const [apiKeys, setApiKeys] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  // 办公联动
  const [obsidianPath, setObsidianPath] = useState("");
  const [obsidianKbId, setObsidianKbId] = useState("");
  const [obsidianSyncing, setObsidianSyncing] = useState(false);
  const [feishuAppId, setFeishuAppId] = useState("");
  const [feishuSecret, setFeishuSecret] = useState("");
  const [feishuLoading, setFeishuLoading] = useState(false);

  const BACKEND_URL = api.defaults.baseURL ?? "http://localhost:8000";
  const webhookUrl = `${BACKEND_URL}/api/integrations/feishu/webhook`;

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const model = await SecureStore.getItemAsync("selected_model");
      if (model) setSelectedModel(model);
      const keys = await SecureStore.getItemAsync("api_keys");
      if (keys) setApiKeys(JSON.parse(keys));
    } catch {
      /* 忽略 */
    }
  };

  const saveModel = async (modelId: string) => {
    setSelectedModel(modelId);
    await SecureStore.setItemAsync("selected_model", modelId);
  };

  const saveApiKey = async (modelId: string, key: string) => {
    const newKeys = { ...apiKeys, [modelId]: key };
    setApiKeys(newKeys);
    await SecureStore.setItemAsync("api_keys", JSON.stringify(newKeys));
  };

  const handleSyncObsidian = async () => {
    if (!obsidianPath.trim()) {
      Alert.alert("请填写 Vault 路径");
      return;
    }
    setObsidianSyncing(true);
    try {
      await api.post("/api/integrations/obsidian/configure", {
        vault_path: obsidianPath,
        kb_id: obsidianKbId || null,
      });
      const res = await api.post("/api/integrations/obsidian/sync");
      const s = res.data?.stats ?? {};
      Alert.alert(
        "同步完成",
        `新增 ${s.added ?? 0}，更新 ${s.updated ?? 0}，跳过 ${s.skipped ?? 0}`,
      );
    } catch (e: any) {
      Alert.alert("同步失败", e.response?.data?.detail ?? e.message);
    } finally {
      setObsidianSyncing(false);
    }
  };

  const handleSaveFeishu = async () => {
    if (!feishuAppId || !feishuSecret) {
      Alert.alert("请填写 App ID 和 App Secret");
      return;
    }
    setFeishuLoading(true);
    try {
      const params = new URLSearchParams({
        app_id: feishuAppId,
        app_secret: feishuSecret,
      });
      await api.post(`/api/integrations/feishu/configure?${params}`);
      Alert.alert("保存成功", "飞书机器人已配置");
    } catch (e: any) {
      Alert.alert("保存失败", e.response?.data?.detail ?? e.message);
    } finally {
      setFeishuLoading(false);
    }
  };

  const handleLogout = () => {
    Alert.alert("退出登录", "确定要退出吗？", [
      { text: "取消", style: "cancel" },
      { text: "退出", style: "destructive", onPress: logout },
    ]);
  };

  const tabs: { id: Tab; label: string; icon: string }[] = [
    { id: "model", label: "模型", icon: "hardware-chip-outline" },
    { id: "integration", label: "联动", icon: "link-outline" },
    { id: "account", label: "账号", icon: "person-outline" },
  ];

  return (
    <SafeAreaView style={styles.container} edges={["bottom"]}>
      {/* 选项卡 */}
      <View style={styles.tabBar}>
        {tabs.map((t) => (
          <TouchableOpacity
            key={t.id}
            style={[styles.tab, activeTab === t.id && styles.tabActive]}
            onPress={() => setActiveTab(t.id)}
          >
            <Ionicons
              name={t.icon as any}
              size={16}
              color={activeTab === t.id ? COLORS.primary : COLORS.textMuted}
            />
            <Text
              style={[
                styles.tabText,
                activeTab === t.id && styles.tabTextActive,
              ]}
            >
              {t.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* ── 模型选择 ── */}
        {activeTab === "model" && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>对话模型</Text>
            {MODELS.map((m) => (
              <TouchableOpacity
                key={m.id}
                style={[
                  styles.modelCard,
                  selectedModel === m.id && styles.modelCardSelected,
                ]}
                onPress={() => saveModel(m.id)}
              >
                <Text style={styles.modelIcon}>{m.icon}</Text>
                <View style={styles.modelInfo}>
                  <Text style={styles.modelName}>{m.label}</Text>
                  <Text style={styles.modelDesc}>{m.desc}</Text>
                </View>
                {selectedModel === m.id && (
                  <Ionicons
                    name="radio-button-on"
                    size={20}
                    color={COLORS.primary}
                  />
                )}
              </TouchableOpacity>
            ))}

            {["deepseek", "openai"].includes(selectedModel) && (
              <View style={styles.apiKeySection}>
                <Text style={styles.fieldLabel}>API Key</Text>
                <TextInput
                  style={styles.textInput}
                  value={apiKeys[selectedModel] ?? ""}
                  onChangeText={(v) => saveApiKey(selectedModel, v)}
                  placeholder="sk-..."
                  placeholderTextColor={COLORS.textMuted}
                  secureTextEntry
                />
              </View>
            )}

            {selectedModel === "hunyuan" && (
              <View style={styles.apiKeySection}>
                <Text style={styles.fieldLabel}>SecretId</Text>
                <TextInput
                  style={[styles.textInput, { marginBottom: 8 }]}
                  value={apiKeys["hunyuan_id"] ?? ""}
                  onChangeText={(v) => saveApiKey("hunyuan_id", v)}
                  placeholder="AKIDxxx..."
                  placeholderTextColor={COLORS.textMuted}
                />
                <Text style={styles.fieldLabel}>SecretKey</Text>
                <TextInput
                  style={styles.textInput}
                  value={apiKeys["hunyuan_key"] ?? ""}
                  onChangeText={(v) => saveApiKey("hunyuan_key", v)}
                  secureTextEntry
                  placeholder="••••••••"
                  placeholderTextColor={COLORS.textMuted}
                />
              </View>
            )}
          </View>
        )}

        {/* ── 办公联动 ── */}
        {activeTab === "integration" && (
          <>
            {/* Obsidian */}
            <View style={styles.section}>
              <View style={styles.sectionTitleRow}>
                <Text style={styles.sectionTitle}>📝 Obsidian Vault 同步</Text>
              </View>
              <Text style={styles.fieldLabel}>Vault 路径</Text>
              <TextInput
                style={styles.textInput}
                value={obsidianPath}
                onChangeText={setObsidianPath}
                placeholder="/Users/你/Obsidian/MyVault"
                placeholderTextColor={COLORS.textMuted}
              />
              <Text style={[styles.fieldLabel, { marginTop: 10 }]}>
                目标知识库 ID（可选）
              </Text>
              <TextInput
                style={styles.textInput}
                value={obsidianKbId}
                onChangeText={setObsidianKbId}
                placeholder="留空则导入到默认目录"
                placeholderTextColor={COLORS.textMuted}
              />
              <TouchableOpacity
                style={[
                  styles.primaryBtn,
                  obsidianSyncing && styles.primaryBtnDisabled,
                  { marginTop: 14 },
                ]}
                onPress={handleSyncObsidian}
                disabled={obsidianSyncing}
              >
                {obsidianSyncing ? (
                  <ActivityIndicator size="small" color="white" />
                ) : (
                  <Ionicons name="sync-outline" size={16} color="white" />
                )}
                <Text style={styles.primaryBtnText}>
                  {obsidianSyncing ? "同步中..." : "配置并同步"}
                </Text>
              </TouchableOpacity>
            </View>

            {/* 飞书 */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>🤖 飞书机器人</Text>
              <Text style={styles.fieldLabel}>App ID</Text>
              <TextInput
                style={styles.textInput}
                value={feishuAppId}
                onChangeText={setFeishuAppId}
                placeholder="cli_xxxxxxxxxxxxxxxx"
                placeholderTextColor={COLORS.textMuted}
              />
              <Text style={[styles.fieldLabel, { marginTop: 10 }]}>
                App Secret
              </Text>
              <TextInput
                style={styles.textInput}
                value={feishuSecret}
                onChangeText={setFeishuSecret}
                secureTextEntry
                placeholder="••••••••••••••••••••"
                placeholderTextColor={COLORS.textMuted}
              />
              <TouchableOpacity
                style={[
                  styles.primaryBtn,
                  feishuLoading && styles.primaryBtnDisabled,
                  { marginTop: 14 },
                ]}
                onPress={handleSaveFeishu}
                disabled={feishuLoading}
              >
                {feishuLoading ? (
                  <ActivityIndicator size="small" color="white" />
                ) : (
                  <Ionicons name="save-outline" size={16} color="white" />
                )}
                <Text style={styles.primaryBtnText}>保存配置</Text>
              </TouchableOpacity>

              {/* Webhook 地址 */}
              <View style={styles.webhookBox}>
                <Text style={styles.webhookLabel}>Webhook 事件订阅地址：</Text>
                <Text style={styles.webhookUrl} numberOfLines={2}>
                  {webhookUrl}
                </Text>
                <TouchableOpacity
                  onPress={() => {
                    // React Native 没有 clipboard API，引导复制
                    Alert.alert("Webhook 地址", webhookUrl, [{ text: "好的" }]);
                  }}
                  style={styles.webhookCopyBtn}
                >
                  <Ionicons
                    name="copy-outline"
                    size={14}
                    color={COLORS.primary}
                  />
                  <Text style={styles.webhookCopyText}>查看</Text>
                </TouchableOpacity>
              </View>

              <TouchableOpacity
                onPress={() => Linking.openURL("https://open.feishu.cn/app")}
                style={styles.linkRow}
              >
                <Ionicons
                  name="open-outline"
                  size={14}
                  color={COLORS.primary}
                />
                <Text style={styles.linkText}>前往飞书开放平台创建应用</Text>
              </TouchableOpacity>
            </View>
          </>
        )}

        {/* ── 账号 ── */}
        {activeTab === "account" && (
          <View style={styles.section}>
            <View style={styles.userCard}>
              <View style={styles.userAvatar}>
                <Text style={styles.userAvatarText}>
                  {(user?.email?.[0] ?? "?").toUpperCase()}
                </Text>
              </View>
              <View>
                <Text style={styles.userEmail}>{user?.email ?? "未登录"}</Text>
                <Text style={styles.userJoined}>
                  注册时间：
                  {user?.created_at
                    ? new Date(user.created_at).toLocaleDateString()
                    : "-"}
                </Text>
              </View>
            </View>

            <TouchableOpacity style={styles.dangerBtn} onPress={handleLogout}>
              <Ionicons
                name="log-out-outline"
                size={16}
                color={COLORS.danger}
              />
              <Text style={styles.dangerBtnText}>退出登录</Text>
            </TouchableOpacity>

            <View style={styles.versionRow}>
              <Text style={styles.versionText}>KnowledgeRAG Mobile v1.0.0</Text>
            </View>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  tabBar: {
    flexDirection: "row",
    backgroundColor: COLORS.card,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  tab: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    paddingVertical: 12,
  },
  tabActive: { borderBottomWidth: 2, borderBottomColor: COLORS.primary },
  tabText: { fontSize: 13, color: COLORS.textMuted },
  tabTextActive: { color: COLORS.primary, fontWeight: "600" },
  content: { flex: 1 },
  section: {
    margin: SPACING.md,
    backgroundColor: COLORS.card,
    borderRadius: RADIUS.lg,
    padding: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: 0,
  },
  sectionTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 14,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: COLORS.text,
    marginBottom: 14,
  },
  modelCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: SPACING.sm,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: 8,
  },
  modelCardSelected: {
    borderColor: COLORS.primary,
    backgroundColor: COLORS.primary + "08",
  },
  modelIcon: { fontSize: 20 },
  modelInfo: { flex: 1 },
  modelName: { fontSize: 14, fontWeight: "600", color: COLORS.text },
  modelDesc: { fontSize: 12, color: COLORS.textMuted, marginTop: 2 },
  apiKeySection: { marginTop: 12 },
  fieldLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: COLORS.textMuted,
    marginBottom: 6,
  },
  textInput: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.sm,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 14,
    color: COLORS.text,
    backgroundColor: COLORS.background,
  },
  primaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: COLORS.primary,
    borderRadius: RADIUS.sm,
    paddingVertical: 10,
  },
  primaryBtnDisabled: { opacity: 0.6 },
  primaryBtnText: { color: "white", fontWeight: "600", fontSize: 14 },
  webhookBox: {
    marginTop: 14,
    backgroundColor: "#f8fafc",
    borderRadius: RADIUS.sm,
    padding: SPACING.sm,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  webhookLabel: { fontSize: 12, color: COLORS.textMuted, marginBottom: 4 },
  webhookUrl: {
    fontSize: 11,
    color: "#1e40af",
    fontFamily: "monospace",
    marginBottom: 8,
  },
  webhookCopyBtn: { flexDirection: "row", alignItems: "center", gap: 4 },
  webhookCopyText: { fontSize: 12, color: COLORS.primary },
  linkRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 12,
  },
  linkText: { fontSize: 13, color: COLORS.primary },
  userCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    padding: SPACING.md,
    backgroundColor: COLORS.background,
    borderRadius: RADIUS.md,
    marginBottom: 20,
  },
  userAvatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: COLORS.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  userAvatarText: { color: "white", fontSize: 20, fontWeight: "700" },
  userEmail: { fontSize: 15, fontWeight: "600", color: COLORS.text },
  userJoined: { fontSize: 12, color: COLORS.textMuted, marginTop: 3 },
  dangerBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderWidth: 1,
    borderColor: COLORS.danger + "60",
    borderRadius: RADIUS.sm,
    paddingVertical: 10,
    marginBottom: 20,
  },
  dangerBtnText: { color: COLORS.danger, fontWeight: "600", fontSize: 14 },
  versionRow: { alignItems: "center", paddingTop: 8 },
  versionText: { fontSize: 12, color: COLORS.textMuted },
});
