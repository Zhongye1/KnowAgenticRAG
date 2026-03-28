import React, { useState, useRef } from 'react';
import {
  TouchableOpacity, StyleSheet, Alert, Animated, View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system';
import { api } from '../utils/api';
import { COLORS } from '../constants/theme';

interface Props {
  onTranscribed: (text: string) => void;
  onError?: (msg: string) => void;
}

export default function VoiceButton({ onTranscribed, onError }: Props) {
  const [recording, setRecording] = useState<Audio.Recording | null>(null);
  const [loading, setLoading] = useState(false);
  const scaleAnim = useRef(new Animated.Value(1)).current;

  const startPulse = () => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(scaleAnim, { toValue: 1.25, duration: 500, useNativeDriver: true }),
        Animated.timing(scaleAnim, { toValue: 1, duration: 500, useNativeDriver: true }),
      ])
    ).start();
  };

  const stopPulse = () => {
    scaleAnim.stopAnimation();
    Animated.timing(scaleAnim, { toValue: 1, duration: 150, useNativeDriver: true }).start();
  };

  const startRecording = async () => {
    try {
      const { status } = await Audio.requestPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('需要麦克风权限', '请在系统设置中允许使用麦克风');
        return;
      }
      await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
      const { recording: rec } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY
      );
      setRecording(rec);
      startPulse();
    } catch (e: any) {
      onError?.(`录音启动失败: ${e.message}`);
    }
  };

  const stopAndTranscribe = async () => {
    if (!recording) return;
    stopPulse();
    setLoading(true);
    try {
      await recording.stopAndUnloadAsync();
      const uri = recording.getURI();
      setRecording(null);

      if (!uri) throw new Error('录音文件不存在');

      // 上传到 Whisper 后端
      const formData = new FormData();
      formData.append('file', {
        uri,
        name: 'voice.m4a',
        type: 'audio/m4a',
      } as any);
      formData.append('language', 'zh');

      const res = await api.post('/api/voice/transcribe', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 60000,
      });

      const text = res.data?.text?.trim() ?? '';
      if (text) {
        onTranscribed(text);
      } else {
        onError?.('识别结果为空，请重试');
      }

      // 清理临时文件
      try { await FileSystem.deleteAsync(uri, { idempotent: true }); } catch { /* 忽略 */ }
    } catch (e: any) {
      onError?.(`转录失败: ${e.response?.data?.detail ?? e.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handlePress = () => {
    if (loading) return;
    if (recording) {
      stopAndTranscribe();
    } else {
      startRecording();
    }
  };

  const color = recording ? '#ef4444' : loading ? COLORS.textMuted : COLORS.primary;

  return (
    <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
      <TouchableOpacity
        style={[styles.btn, { borderColor: color + '40', backgroundColor: color + '15' }]}
        onPress={handlePress}
        disabled={loading}
        activeOpacity={0.7}
      >
        <Ionicons
          name={loading ? 'hourglass-outline' : recording ? 'stop-circle' : 'mic-outline'}
          size={20}
          color={color}
        />
      </TouchableOpacity>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  btn: {
    width: 40, height: 40, borderRadius: 20,
    borderWidth: 1.5, alignItems: 'center', justifyContent: 'center',
  },
});
