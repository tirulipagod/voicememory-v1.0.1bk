import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, router } from 'expo-router';
import { useAuth } from '../src/contexts/AuthContext';
import { Audio } from 'expo-av';
import * as Haptics from 'expo-haptics';
import { localStorage, LocalMemory } from '../src/services/LocalStorage';
import 'react-native-get-random-values';
import { v4 as uuidv4 } from 'uuid';

export default function ChallengeModeScreen() {
    const { text, emoji } = useLocalSearchParams<{ text: string; emoji: string }>();
    const { user, completeDailyChallenge, addAvatarXP } = useAuth();

    const [recordingState, setRecordingState] = useState<'idle' | 'recording' | 'validating'>('idle');
    const [recording, setRecording] = useState<Audio.Recording | null>(null);
    const [duration, setDuration] = useState(0);

    const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

    useEffect(() => {
        return () => {
            if (timerRef.current) clearInterval(timerRef.current);
        };
    }, []);

    const startRecording = async () => {
        try {
            await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            if (recording) {
                try { await recording.stopAndUnloadAsync(); } catch (e) { }
                setRecording(null);
            }
            const audioPermission = await Audio.requestPermissionsAsync();
            if (!audioPermission.granted) {
                Alert.alert('Permissão', 'Precisamos de permissão para gravar.');
                return;
            }
            await Audio.setAudioModeAsync({
                allowsRecordingIOS: true,
                playsInSilentModeIOS: true,
            });

            const { recording: newRecording } = await Audio.Recording.createAsync(
                Audio.RecordingOptionsPresets.HIGH_QUALITY
            );

            setRecording(newRecording);
            setRecordingState('recording');
            setDuration(0);

            timerRef.current = setInterval(() => {
                setDuration(d => d + 1);
            }, 1000);
        } catch (e) {
            console.error(e);
            Alert.alert('Erro', 'Não foi possível iniciar a gravação.');
            setRecordingState('idle');
        }
    };

    const stopRecording = async () => {
        if (!recording) return;

        try {
            await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            if (timerRef.current) clearInterval(timerRef.current);

            await recording.stopAndUnloadAsync();
            const uri = recording.getURI();
            setRecording(null);
            setRecordingState('validating');

            if (!uri) throw new Error('No URI');

            const response = await fetch(uri);
            const blob = await response.blob();
            const base64 = await new Promise<string>((resolve, reject) => {
                const reader = new FileReader();
                reader.onloadend = () => resolve((reader.result as string).split(',')[1]);
                reader.onerror = reject;
                reader.readAsDataURL(blob);
            });

            const backendUrl = process.env.EXPO_PUBLIC_BACKEND_URL || '';

            // Submit custom validation endpoint
            const validateRes = await fetch(`${backendUrl}/api/validate_challenge`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    audio_base64: base64,
                    challenge_text: text
                }),
            });

            if (!validateRes.ok) {
                throw new Error('Falha no backend');
            }

            const valData = await validateRes.json();

            // Extract memory contents
            const emotionResult = valData.memory_data || {
                emotion: 'Reflexivo',
                emoji: '🤔',
                score: 5,
                summary: valData.feedback,
                emotions: []
            };

            // Save to device
            const now = new Date().toISOString();
            const memory: LocalMemory = {
                id: uuidv4(),
                userId: user?.id || 'unknown',
                transcription: valData.transcription || '',
                emotion: emotionResult.emotion,
                emotionEmoji: emotionResult.emoji,
                moodScore: emotionResult.score,
                audioBase64: base64,
                durationSeconds: duration,
                summary: valData.feedback,
                createdAt: now,
                updatedAt: now,
                synced: false,
            };

            if (valData.success) {
                // Salvar e recompensar/completar desafio
                await localStorage.saveMemory(memory);
                await addAvatarXP(valData.reward_xp || 50);
                await completeDailyChallenge(text);

                Alert.alert('Desafio Concluído! 🎉', valData.feedback, [
                    { text: 'Legal!', onPress: () => router.back() }
                ]);
            } else {
                Alert.alert(
                    'Quase lá...',
                    valData.feedback + '\n\nO que deseja fazer com esta gravação?',
                    [
                        {
                            text: 'Tentar Novamente',
                            onPress: () => {
                                setRecordingState('idle');
                                setDuration(0);
                            }
                        },
                        {
                            text: 'Salvar Mesmo Assim',
                            onPress: async () => {
                                await localStorage.saveMemory(memory);
                                router.back();
                            }
                        },
                        {
                            text: 'Descartar e Sair',
                            style: 'destructive',
                            onPress: () => router.back()
                        }
                    ]
                );
            }

        } catch (e) {
            console.error(e);
            Alert.alert('Erro', 'Ocorreu um problema ao validar seu desafio.');
            setRecordingState('idle');
        }
    };

    const formatTime = (seconds: number) => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    return (
        <SafeAreaView style={styles.container}>
            <View style={styles.header}>
                <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
                    <Ionicons name="close" size={28} color="#fff" />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>Modo Desafio</Text>
                <View style={{ width: 40 }} />
            </View>

            <View style={styles.content}>
                <Text style={styles.emoji}>{emoji}</Text>
                <Text style={styles.title}>Reflita sobre:</Text>
                <Text style={styles.challengeText}>"{text}"</Text>

                <View style={styles.instructionsBox}>
                    <Ionicons name="information-circle-outline" size={20} color="#a78bfa" />
                    <Text style={styles.instructionsText}>
                        Pressione o botão para começar. Fale com naturalidade o que vier à mente, sem julgamentos. Responda do seu jeito.
                    </Text>
                </View>
            </View>

            <View style={styles.bottomArea}>
                {recordingState === 'validating' ? (
                    <View style={styles.loadingContainer}>
                        <ActivityIndicator size="large" color="#a78bfa" />
                        <Text style={styles.loadingText}>A IA está validando sua resposta...</Text>
                    </View>
                ) : (
                    <View style={styles.recordContainer}>
                        <Text style={styles.timeText}>{formatTime(duration)}</Text>
                        <TouchableOpacity
                            style={[
                                styles.recordBtn,
                                recordingState === 'recording' && styles.recordingBtnActive
                            ]}
                            onPress={recordingState === 'recording' ? stopRecording : startRecording}
                        >
                            <Ionicons
                                name={recordingState === 'recording' ? 'stop' : 'mic'}
                                size={32}
                                color="#fff"
                            />
                        </TouchableOpacity>
                        <Text style={styles.recordSubtext}>
                            {recordingState === 'recording' ? 'Toque para finalizar' : 'Toque para começar'}
                        </Text>
                    </View>
                )}
            </View>
        </SafeAreaView >
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#0f172a',
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 20,
        paddingTop: 20,
        paddingBottom: 10,
    },
    backBtn: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: '#1e293b',
        alignItems: 'center',
        justifyContent: 'center',
    },
    headerTitle: {
        color: '#fff',
        fontSize: 18,
        fontFamily: 'Outfit-SemiBold',
    },
    content: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 30,
    },
    emoji: {
        fontSize: 70,
        marginBottom: 20,
    },
    title: {
        color: '#a78bfa',
        fontSize: 18,
        fontFamily: 'Inter-Medium',
        marginBottom: 10,
        textTransform: 'uppercase',
        letterSpacing: 2,
    },
    challengeText: {
        color: '#f8fafc',
        fontSize: 28,
        fontFamily: 'Outfit-Bold',
        textAlign: 'center',
        marginBottom: 40,
        lineHeight: 36,
    },
    instructionsBox: {
        flexDirection: 'row',
        backgroundColor: 'rgba(139, 92, 246, 0.15)',
        padding: 15,
        borderRadius: 12,
        alignItems: 'flex-start',
        gap: 10,
    },
    instructionsText: {
        color: '#cbd5e1',
        flex: 1,
        fontSize: 14,
        fontFamily: 'Inter-Regular',
        lineHeight: 20,
    },
    bottomArea: {
        padding: 30,
        paddingBottom: 50,
        alignItems: 'center',
    },
    loadingContainer: {
        alignItems: 'center',
        justifyContent: 'center',
        gap: 15,
        height: 120,
    },
    loadingText: {
        color: '#a78bfa',
        fontSize: 16,
        fontFamily: 'Inter-Medium',
    },
    recordContainer: {
        alignItems: 'center',
        gap: 15,
    },
    timeText: {
        color: '#fff',
        fontSize: 24,
        fontFamily: 'Outfit-Medium',
        fontVariant: ['tabular-nums'],
    },
    recordBtn: {
        width: 80,
        height: 80,
        borderRadius: 40,
        backgroundColor: '#8b5cf6',
        alignItems: 'center',
        justifyContent: 'center',
        shadowColor: '#8b5cf6',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.4,
        shadowRadius: 15,
        elevation: 10,
    },
    recordingBtnActive: {
        backgroundColor: '#ef4444',
        shadowColor: '#ef4444',
    },
    recordSubtext: {
        color: '#64748b',
        fontSize: 14,
        fontFamily: 'Inter-Regular',
    }
});
