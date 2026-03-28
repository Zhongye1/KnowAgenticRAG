import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ActivityIndicator, Alert, ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '../store/useAuthStore';
import { COLORS, FONTS, RADIUS, SPACING, SHADOW } from '../constants/theme';

export default function LoginScreen() {
  const { login, register, loading } = useAuthStore();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPwd, setConfirmPwd] = useState('');
  const [showPwd, setShowPwd] = useState(false);

  const handleSubmit = async () => {
    if (!email.trim() || !password) { Alert.alert('请填写邮箱和密码'); return; }
    if (mode === 'register' && password !== confirmPwd) { Alert.alert('两次密码不一致'); return; }
    try {
      if (mode === 'login') {
        await login(email.trim(), password);
      } else {
        await register(email.trim(), password);
        Alert.alert('注册成功', '请登录', [{ text: '去登录', onPress: () => setMode('login') }]);
      }
    } catch (e: any) {
      const msg = e.response?.data?.detail ?? e.message ?? '操作失败';
      Alert.alert(mode === 'login' ? '登录失败' : '注册失败', msg);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          {/* Logo */}
          <View style={styles.logoArea}>
            <View style={styles.logoCircle}>
              <Ionicons name="library" size={40} color="white" />
            </View>
            <Text style={styles.appName}>KnowledgeRAG</Text>
            <Text style={styles.appSlogan}>AI 知识库问答助手</Text>
          </View>

          {/* 卡片 */}
          <View style={styles.card}>
            {/* 模式切换 */}
            <View style={styles.modeToggle}>
              <TouchableOpacity
                style={[styles.modeBtn, mode === 'login' && styles.modeBtnActive]}
                onPress={() => setMode('login')}
              >
                <Text style={[styles.modeBtnText, mode === 'login' && styles.modeBtnTextActive]}>
                  登录
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modeBtn, mode === 'register' && styles.modeBtnActive]}
                onPress={() => setMode('register')}
              >
                <Text style={[styles.modeBtnText, mode === 'register' && styles.modeBtnTextActive]}>
                  注册
                </Text>
              </TouchableOpacity>
            </View>

            {/* 邮箱 */}
            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>邮箱</Text>
              <View style={styles.inputWrapper}>
                <Ionicons name="mail-outline" size={18} color={COLORS.textMuted} style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  value={email}
                  onChangeText={setEmail}
                  placeholder="your@email.com"
                  placeholderTextColor={COLORS.textMuted}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoComplete="email"
                />
              </View>
            </View>

            {/* 密码 */}
            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>密码</Text>
              <View style={styles.inputWrapper}>
                <Ionicons name="lock-closed-outline" size={18} color={COLORS.textMuted} style={styles.inputIcon} />
                <TextInput
                  style={[styles.input, styles.inputFlex]}
                  value={password}
                  onChangeText={setPassword}
                  placeholder="••••••••"
                  placeholderTextColor={COLORS.textMuted}
                  secureTextEntry={!showPwd}
                  autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                />
                <TouchableOpacity onPress={() => setShowPwd(!showPwd)} style={styles.eyeBtn}>
                  <Ionicons name={showPwd ? 'eye-off-outline' : 'eye-outline'} size={18} color={COLORS.textMuted} />
                </TouchableOpacity>
              </View>
            </View>

            {/* 确认密码（注册专用） */}
            {mode === 'register' && (
              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>确认密码</Text>
                <View style={styles.inputWrapper}>
                  <Ionicons name="shield-checkmark-outline" size={18} color={COLORS.textMuted} style={styles.inputIcon} />
                  <TextInput
                    style={styles.input}
                    value={confirmPwd}
                    onChangeText={setConfirmPwd}
                    placeholder="再输入一次密码"
                    placeholderTextColor={COLORS.textMuted}
                    secureTextEntry={!showPwd}
                  />
                </View>
              </View>
            )}

            {/* 提交按钮 */}
            <TouchableOpacity
              style={[styles.submitBtn, loading && styles.submitBtnDisabled]}
              onPress={handleSubmit}
              disabled={loading}
            >
              {loading
                ? <ActivityIndicator size="small" color="white" />
                : <Text style={styles.submitBtnText}>{mode === 'login' ? '登录' : '注册'}</Text>}
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  flex: { flex: 1 },
  scroll: { flexGrow: 1, justifyContent: 'center', padding: SPACING.lg },
  logoArea: { alignItems: 'center', marginBottom: SPACING.xl },
  logoCircle: {
    width: 80, height: 80, borderRadius: 24,
    backgroundColor: COLORS.primary,
    alignItems: 'center', justifyContent: 'center', marginBottom: 14,
    ...SHADOW.md,
  },
  appName: { ...FONTS.title, fontSize: 26, color: COLORS.text },
  appSlogan: { fontSize: 14, color: COLORS.textMuted, marginTop: 4 },
  card: {
    backgroundColor: COLORS.card, borderRadius: RADIUS.xl,
    padding: SPACING.lg, borderWidth: 1, borderColor: COLORS.border,
    ...SHADOW.md,
  },
  modeToggle: {
    flexDirection: 'row', backgroundColor: COLORS.background,
    borderRadius: RADIUS.md, padding: 3, marginBottom: SPACING.lg,
  },
  modeBtn: { flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: RADIUS.sm - 2 },
  modeBtnActive: { backgroundColor: 'white', ...SHADOW.sm },
  modeBtnText: { fontSize: 15, color: COLORS.textMuted, fontWeight: '500' },
  modeBtnTextActive: { color: COLORS.primary, fontWeight: '700' },
  fieldGroup: { marginBottom: SPACING.md },
  fieldLabel: { fontSize: 13, fontWeight: '600', color: COLORS.text, marginBottom: 6 },
  inputWrapper: {
    flexDirection: 'row', alignItems: 'center',
    borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.md,
    backgroundColor: COLORS.background, paddingHorizontal: 10,
  },
  inputIcon: { marginRight: 8 },
  input: { flex: 1, height: 46, fontSize: 15, color: COLORS.text },
  inputFlex: { flex: 1 },
  eyeBtn: { padding: 4 },
  submitBtn: {
    backgroundColor: COLORS.primary, borderRadius: RADIUS.md,
    paddingVertical: 14, alignItems: 'center', marginTop: 6,
  },
  submitBtnDisabled: { opacity: 0.6 },
  submitBtnText: { color: 'white', fontSize: 16, fontWeight: '700' },
});
