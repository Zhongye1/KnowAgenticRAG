import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  View,
  Text,
  FlatList,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  Alert,
  Modal,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { api } from "../utils/api";
import { COLORS, RADIUS, SPACING, SHADOW, FONTS } from "../constants/theme";

// ── 工具 ──────────────────────────────────────────────────────
function formatNum(n: number) {
  if (n >= 1000) return (n / 1000).toFixed(1) + "k";
  return String(n);
}
const GRADIENTS = [
  "#667eea",
  "#f093fb",
  "#4facfe",
  "#43e97b",
  "#fa709a",
  "#a18cd1",
];
function coverColor(id: number) {
  return GRADIENTS[id % GRADIENTS.length];
}

// ── 类型 ──────────────────────────────────────────────────────
interface SharedKb {
  id: number;
  kb_id: string;
  kb_name: string;
  description: string;
  tags: string[];
  category: string;
  cover_color: string;
  author_id: string;
  author_name: string;
  view_count: number;
  star_count: number;
  fork_count: number;
  created_at: number;
}
interface Circle {
  id: number;
  name: string;
  description: string;
  color: string;
  member_count: number;
  kb_count: number;
  _joined?: boolean;
}

const CATEGORIES = [
  { id: "all", label: "全部" },
  { id: "tech", label: "技术" },
  { id: "science", label: "科学" },
  { id: "business", label: "商业" },
  { id: "art", label: "人文" },
  { id: "medical", label: "医学" },
  { id: "law", label: "法律" },
  { id: "edu", label: "教育" },
];
const SORT_OPTIONS = [
  { value: "hot", label: "🔥热度" },
  { value: "new", label: "🕒最新" },
  { value: "star", label: "⭐星标" },
];

// ── 知识库卡片 ───────────────────────────────────────────────
function KbCard({
  kb,
  onStar,
  starred,
}: {
  kb: SharedKb;
  onStar: (kb: SharedKb) => void;
  starred: boolean;
}) {
  return (
    <View style={styles.card}>
      {/* 封面色块 */}
      <View
        style={[
          styles.cardCover,
          { backgroundColor: kb.cover_color || coverColor(kb.id) },
        ]}
      >
        <Text style={styles.cardCoverText}>{kb.kb_name[0]}</Text>
      </View>
      {/* 内容区 */}
      <View style={styles.cardBody}>
        <Text style={styles.cardTitle} numberOfLines={1}>
          {kb.kb_name}
        </Text>
        {kb.description ? (
          <Text style={styles.cardDesc} numberOfLines={2}>
            {kb.description}
          </Text>
        ) : null}
        {/* 标签 */}
        {kb.tags.length > 0 && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.tagRow}
          >
            {kb.tags.slice(0, 3).map((tag) => (
              <Text key={tag} style={styles.tag}>
                #{tag}
              </Text>
            ))}
          </ScrollView>
        )}
        {/* 底部 */}
        <View style={styles.cardFooter}>
          <View style={styles.authorRow}>
            <View style={styles.authorAvatar}>
              <Text style={styles.authorInitial}>
                {(kb.author_name || "?")[0]}
              </Text>
            </View>
            <Text style={styles.authorName} numberOfLines={1}>
              {kb.author_name}
            </Text>
          </View>
          <View style={styles.statsRow}>
            <Text style={styles.statText}>👁 {formatNum(kb.view_count)}</Text>
            <TouchableOpacity onPress={() => onStar(kb)} style={styles.starBtn}>
              <Text style={[styles.statText, starred && styles.starredText]}>
                ⭐ {formatNum(kb.star_count)}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </View>
  );
}

// ── 圈子卡片 ─────────────────────────────────────────────────
function CircleCard({
  circle,
  onJoin,
}: {
  circle: Circle;
  onJoin: (c: Circle) => void;
}) {
  return (
    <View style={styles.circleCard}>
      <View style={[styles.circleAvatar, { backgroundColor: circle.color }]}>
        <Text style={styles.circleAvatarText}>{circle.name[0]}</Text>
      </View>
      <View style={styles.circleInfo}>
        <Text style={styles.circleName} numberOfLines={1}>
          {circle.name}
        </Text>
        <Text style={styles.circleMeta}>
          {circle.member_count} 成员 · {circle.kb_count} 知识库
        </Text>
      </View>
      <TouchableOpacity
        style={[styles.joinBtn, circle._joined && styles.joinBtnActive]}
        onPress={() => onJoin(circle)}
      >
        <Text
          style={[
            styles.joinBtnText,
            circle._joined && styles.joinBtnTextActive,
          ]}
        >
          {circle._joined ? "已加入" : "+ 加入"}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

// ── 主屏幕 ───────────────────────────────────────────────────
export default function SquareScreen() {
  const [kbList, setKbList] = useState<SharedKb[]>([]);
  const [circles, setCircles] = useState<Circle[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [page, setPage] = useState(1);
  const [searchText, setSearchText] = useState("");
  const [activeCat, setActiveCat] = useState("all");
  const [sortBy, setSortBy] = useState("hot");
  const [starred, setStarred] = useState<Set<number>>(new Set());
  const [showCircles, setShowCircles] = useState(false);
  const [showSort, setShowSort] = useState(false);
  const searchTimer = useRef<any>(null);

  // ── 获取圈子 ──────────────────────────────────────────────
  const loadCircles = useCallback(async () => {
    try {
      const res = await api.get("/api/square/circles?page_size=20");
      setCircles(res.data.items || []);
    } catch {
      /* 静默 */
    }
  }, []);

  // ── 获取知识库列表 ───────────────────────────────────────
  const fetchKbs = useCallback(
    async (
      reset: boolean,
      keyword: string,
      cat: string,
      sort: string,
      pg: number,
    ) => {
      try {
        const params = new URLSearchParams({
          category: cat,
          sort,
          keyword,
          page: String(pg),
          page_size: "10",
        });
        const res = await api.get(`/api/square/kbs?${params}`);
        const data = res.data;
        if (reset) {
          setKbList(data.items || []);
        } else {
          setKbList((prev) => [...prev, ...(data.items || [])]);
        }
        setHasMore(data.has_more);
      } catch {
        /* 静默 */
      }
    },
    [],
  );

  const loadKbs = useCallback(
    async (reset = true) => {
      if (reset) {
        setLoading(true);
        setPage(1);
      }
      await fetchKbs(reset, searchText, activeCat, sortBy, reset ? 1 : page);
      setLoading(false);
      setRefreshing(false);
    },
    [searchText, activeCat, sortBy, page, fetchKbs],
  );

  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    const nextPage = page + 1;
    setPage(nextPage);
    await fetchKbs(false, searchText, activeCat, sortBy, nextPage);
    setLoadingMore(false);
  }, [loadingMore, hasMore, page, searchText, activeCat, sortBy, fetchKbs]);

  // ── 收藏 ─────────────────────────────────────────────────
  const handleStar = useCallback(async (kb: SharedKb) => {
    try {
      const res = await api.post(`/api/square/kbs/${kb.id}/star`, {
        user_id: "mobile_user",
      });
      setStarred((prev) => {
        const next = new Set(prev);
        if (res.data.starred) next.add(kb.id);
        else next.delete(kb.id);
        return next;
      });
      setKbList((prev) =>
        prev.map((k) =>
          k.id === kb.id
            ? { ...k, star_count: k.star_count + (res.data.starred ? 1 : -1) }
            : k,
        ),
      );
    } catch {
      /* 静默 */
    }
  }, []);

  // ── 加入/退出圈子 ─────────────────────────────────────────
  const handleJoin = useCallback(async (circle: Circle) => {
    try {
      if (circle._joined) {
        await api.delete(
          `/api/square/circles/${circle.id}/join?user_id=mobile_user`,
        );
        setCircles((prev) =>
          prev.map((c) =>
            c.id === circle.id
              ? {
                  ...c,
                  _joined: false,
                  member_count: Math.max(1, c.member_count - 1),
                }
              : c,
          ),
        );
      } else {
        await api.post(`/api/square/circles/${circle.id}/join`, {
          user_id: "mobile_user",
        });
        setCircles((prev) =>
          prev.map((c) =>
            c.id === circle.id
              ? { ...c, _joined: true, member_count: c.member_count + 1 }
              : c,
          ),
        );
      }
    } catch (e: any) {
      Alert.alert("提示", e?.response?.data?.detail || "操作失败");
    }
  }, []);

  // ── 搜索防抖 ─────────────────────────────────────────────
  const handleSearchChange = useCallback(
    (text: string) => {
      setSearchText(text);
      clearTimeout(searchTimer.current);
      searchTimer.current = setTimeout(() => {
        setPage(1);
        setLoading(true);
        fetchKbs(true, text, activeCat, sortBy, 1).then(() =>
          setLoading(false),
        );
      }, 600);
    },
    [activeCat, sortBy, fetchKbs],
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadKbs(true);
  }, [loadKbs]);

  useEffect(() => {
    loadCircles();
    loadKbs(true);
  }, [activeCat, sortBy]);

  // ── 渲染 ─────────────────────────────────────────────────
  const renderItem = useCallback(
    ({ item }: { item: SharedKb }) => (
      <KbCard kb={item} onStar={handleStar} starred={starred.has(item.id)} />
    ),
    [handleStar, starred],
  );

  const ListHeader = (
    <View>
      {/* 搜索框 */}
      <View style={styles.searchBar}>
        <Ionicons name="search-outline" size={16} color={COLORS.textMuted} />
        <TextInput
          style={styles.searchInput}
          placeholder="搜索知识库、标签、作者..."
          placeholderTextColor={COLORS.textMuted}
          value={searchText}
          onChangeText={handleSearchChange}
          returnKeyType="search"
        />
        {searchText.length > 0 && (
          <TouchableOpacity onPress={() => handleSearchChange("")}>
            <Ionicons name="close-circle" size={16} color={COLORS.textMuted} />
          </TouchableOpacity>
        )}
      </View>

      {/* 分类 Tabs */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.catScroll}
        contentContainerStyle={styles.catContent}
      >
        {CATEGORIES.map((cat) => (
          <TouchableOpacity
            key={cat.id}
            style={[styles.catTab, activeCat === cat.id && styles.catTabActive]}
            onPress={() => setActiveCat(cat.id)}
          >
            <Text
              style={[
                styles.catTabText,
                activeCat === cat.id && styles.catTabTextActive,
              ]}
            >
              {cat.label}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* 操作栏 */}
      <View style={styles.actionBar}>
        <TouchableOpacity
          style={styles.actionBtn}
          onPress={() => setShowCircles(true)}
        >
          <Ionicons name="people-outline" size={14} color={COLORS.primary} />
          <Text style={styles.actionBtnText}>圈子</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.actionBtn}
          onPress={() => setShowSort(true)}
        >
          <Ionicons
            name="swap-vertical-outline"
            size={14}
            color={COLORS.primary}
          />
          <Text style={styles.actionBtnText}>
            {SORT_OPTIONS.find((s) => s.value === sortBy)?.label}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  const ListFooter = loadingMore ? (
    <View style={styles.footerLoader}>
      <ActivityIndicator size="small" color={COLORS.primary} />
      <Text style={styles.footerText}>加载更多...</Text>
    </View>
  ) : !hasMore && kbList.length > 0 ? (
    <Text style={styles.noMoreText}>— 已加载全部知识库 —</Text>
  ) : null;

  return (
    <View style={styles.container}>
      {/* 顶部 Banner */}
      <View style={styles.banner}>
        <Text style={styles.bannerTitle}>知识广场</Text>
        <Text style={styles.bannerSub}>发现 · 分享 · 共创</Text>
      </View>

      {loading ? (
        <View style={styles.loadingCenter}>
          <ActivityIndicator size="large" color={COLORS.primary} />
          <Text style={styles.loadingText}>加载知识库...</Text>
        </View>
      ) : (
        <FlatList
          data={kbList}
          renderItem={renderItem}
          keyExtractor={(item) => String(item.id)}
          ListHeaderComponent={ListHeader}
          ListFooterComponent={ListFooter}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Text style={styles.emptyIcon}>📚</Text>
              <Text style={styles.emptyText}>暂无知识库</Text>
              <Text style={styles.emptyHint}>成为第一个发布者！</Text>
            </View>
          }
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={COLORS.primary}
            />
          }
          onEndReached={loadMore}
          onEndReachedThreshold={0.3}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
        />
      )}

      {/* 圈子弹窗 */}
      <Modal
        visible={showCircles}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowCircles(false)}
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>🔥 热门圈子</Text>
            <TouchableOpacity onPress={() => setShowCircles(false)}>
              <Ionicons name="close" size={22} color={COLORS.text} />
            </TouchableOpacity>
          </View>
          <FlatList
            data={circles}
            renderItem={({ item }) => (
              <CircleCard circle={item} onJoin={handleJoin} />
            )}
            keyExtractor={(item) => String(item.id)}
            ListEmptyComponent={
              <View style={styles.emptyState}>
                <Text style={styles.emptyText}>暂无圈子</Text>
              </View>
            }
            contentContainerStyle={{ padding: SPACING.md }}
          />
        </View>
      </Modal>

      {/* 排序弹窗 */}
      <Modal
        visible={showSort}
        animationType="fade"
        transparent
        onRequestClose={() => setShowSort(false)}
      >
        <TouchableOpacity
          style={styles.sortOverlay}
          onPress={() => setShowSort(false)}
          activeOpacity={1}
        >
          <View style={styles.sortSheet}>
            <Text style={styles.sortTitle}>排序方式</Text>
            {SORT_OPTIONS.map((opt) => (
              <TouchableOpacity
                key={opt.value}
                style={[
                  styles.sortOption,
                  sortBy === opt.value && styles.sortOptionActive,
                ]}
                onPress={() => {
                  setSortBy(opt.value);
                  setShowSort(false);
                }}
              >
                <Text
                  style={[
                    styles.sortOptionText,
                    sortBy === opt.value && styles.sortOptionTextActive,
                  ]}
                >
                  {opt.label}
                </Text>
                {sortBy === opt.value && (
                  <Ionicons name="checkmark" size={16} color={COLORS.primary} />
                )}
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },

  // Banner
  banner: {
    backgroundColor: COLORS.primary,
    paddingTop: 16,
    paddingBottom: 20,
    paddingHorizontal: SPACING.lg,
  },
  bannerTitle: { fontSize: 22, fontWeight: "700", color: "#fff" },
  bannerSub: { fontSize: 13, color: "rgba(255,255,255,0.8)", marginTop: 2 },

  // 搜索
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    borderRadius: RADIUS.xl,
    paddingHorizontal: SPACING.md,
    paddingVertical: 10,
    marginHorizontal: SPACING.md,
    marginTop: SPACING.md,
    gap: 8,
    ...SHADOW.sm,
  },
  searchInput: { flex: 1, fontSize: 14, color: COLORS.text },

  // 分类
  catScroll: { marginTop: SPACING.sm },
  catContent: { paddingHorizontal: SPACING.md, gap: 8 },
  catTab: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: RADIUS.xl,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  catTabActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  catTabText: { fontSize: 13, color: COLORS.textMuted },
  catTabTextActive: { color: "#fff", fontWeight: "600" },

  // 操作栏
  actionBar: {
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: SPACING.md,
    marginTop: SPACING.sm,
    marginBottom: 4,
  },
  actionBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: RADIUS.md,
    backgroundColor: "#eff6ff",
    borderWidth: 1,
    borderColor: "#bfdbfe",
  },
  actionBtnText: { fontSize: 12, color: COLORS.primary, fontWeight: "600" },

  // 列表内容
  listContent: { paddingBottom: 32 },
  loadingCenter: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  loadingText: { fontSize: 14, color: COLORS.textMuted },

  // 卡片
  card: {
    backgroundColor: COLORS.card,
    borderRadius: RADIUS.lg,
    marginHorizontal: SPACING.md,
    marginTop: SPACING.sm,
    overflow: "hidden",
    ...SHADOW.md,
  },
  cardCover: {
    height: 110,
    alignItems: "center",
    justifyContent: "center",
  },
  cardCoverText: {
    fontSize: 40,
    fontWeight: "800",
    color: "rgba(255,255,255,0.85)",
  },
  cardBody: { padding: 12 },
  cardTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: COLORS.text,
    marginBottom: 4,
  },
  cardDesc: {
    fontSize: 12,
    color: COLORS.textMuted,
    lineHeight: 17,
    marginBottom: 6,
  },
  tagRow: { marginBottom: 8 },
  tag: {
    fontSize: 11,
    color: COLORS.primary,
    backgroundColor: "#eff6ff",
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    marginRight: 4,
  },
  cardFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  authorRow: { flexDirection: "row", alignItems: "center", gap: 6, flex: 1 },
  authorAvatar: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: "#e5e7eb",
    alignItems: "center",
    justifyContent: "center",
  },
  authorInitial: { fontSize: 10, fontWeight: "700", color: "#6b7280" },
  authorName: { fontSize: 12, color: COLORS.textMuted, flex: 1 },
  statsRow: { flexDirection: "row", gap: 10 },
  statText: { fontSize: 11, color: COLORS.textMuted },
  starBtn: {},
  starredText: { color: "#f59e0b" },

  // 圈子卡片
  circleCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: SPACING.sm,
    backgroundColor: COLORS.card,
    borderRadius: RADIUS.md,
    marginBottom: SPACING.sm,
    ...SHADOW.sm,
  },
  circleAvatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
  },
  circleAvatarText: { fontSize: 16, fontWeight: "700", color: "#fff" },
  circleInfo: { flex: 1 },
  circleName: { fontSize: 14, fontWeight: "600", color: COLORS.text },
  circleMeta: { fontSize: 12, color: COLORS.textMuted, marginTop: 2 },
  joinBtn: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: RADIUS.xl,
    borderWidth: 1,
    borderColor: COLORS.primary,
  },
  joinBtnActive: { backgroundColor: COLORS.primary },
  joinBtnText: { fontSize: 12, color: COLORS.primary, fontWeight: "500" },
  joinBtnTextActive: { color: "#fff" },

  // 底部加载
  footerLoader: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    padding: 16,
    gap: 8,
  },
  footerText: { fontSize: 13, color: COLORS.textMuted },
  noMoreText: {
    textAlign: "center",
    color: COLORS.textMuted,
    fontSize: 12,
    padding: 16,
  },

  // 空状态
  emptyState: { alignItems: "center", paddingVertical: 60 },
  emptyIcon: { fontSize: 48, marginBottom: 12 },
  emptyText: { fontSize: 16, color: COLORS.text, fontWeight: "600" },
  emptyHint: { fontSize: 13, color: COLORS.textMuted, marginTop: 4 },

  // 弹窗
  modalContainer: { flex: 1, backgroundColor: COLORS.background },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    backgroundColor: COLORS.card,
  },
  modalTitle: { fontSize: 17, fontWeight: "700", color: COLORS.text },

  // 排序弹窗
  sortOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "flex-end",
  },
  sortSheet: {
    backgroundColor: COLORS.card,
    borderTopLeftRadius: RADIUS.xl,
    borderTopRightRadius: RADIUS.xl,
    padding: SPACING.lg,
    paddingBottom: 32,
  },
  sortTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: COLORS.text,
    marginBottom: SPACING.md,
  },
  sortOption: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: SPACING.sm,
    borderRadius: RADIUS.md,
    marginBottom: 4,
  },
  sortOptionActive: { backgroundColor: "#eff6ff" },
  sortOptionText: { fontSize: 15, color: COLORS.text },
  sortOptionTextActive: { color: COLORS.primary, fontWeight: "600" },
});
