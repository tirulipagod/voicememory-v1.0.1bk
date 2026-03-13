import React, { useState, useEffect, useRef } from 'react';
import {
    View, Text, StyleSheet, Modal, TouchableOpacity,
    TextInput, Image, ActivityIndicator, ScrollView, Animated
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams } from 'expo-router';
import { localStorage, Connection } from '../../src/services/LocalStorage';
import ConnectionsMap, { ConnectionMetadata } from '../../src/components/connections/ConnectionsMap';
import * as ImagePicker from 'expo-image-picker';
import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system';

export default function ConnectionsScreen() {
    const params = useLocalSearchParams<{ prefillName?: string }>();
    const [connections, setConnections] = useState<Connection[]>([]);
    const [connectionMetadata, setConnectionMetadata] = useState<ConnectionMetadata[]>([]);
    const [isAddModalVisible, setIsAddModalVisible] = useState(false);
    const [newName, setNewName] = useState('');
    const [newRelation, setNewRelation] = useState('');
    const [newPhotoUri, setNewPhotoUri] = useState<string | null>(null);
    const [newSignatureUri, setNewSignatureUri] = useState<string | null>(null);

    // Recorder state for "Gravar Essência"
    const [isRecording, setIsRecording] = useState(false);
    const [recordingObj, setRecordingObj] = useState<Audio.Recording | null>(null);
    const [recordingDuration, setRecordingDuration] = useState(0);
    const recordingTimer = useRef<ReturnType<typeof setInterval> | null>(null);
    const pulseAnim = useRef(new Animated.Value(1)).current;

    const [selectedConnection, setSelectedConnection] = useState<Connection | null>(null);
    const [connectionMemories, setConnectionMemories] = useState<any[]>([]);

    // Phase 3.3: Copiloto Relacional state
    const [copilotSummary, setCopilotSummary] = useState<string>('');
    const [isLoadingCopilot, setIsLoadingCopilot] = useState(false);

    // Bug 4: Essence audio player state
    const [isPlayingEssence, setIsPlayingEssence] = useState(false);
    const soundRef = useRef<Audio.Sound | null>(null);

    useEffect(() => {
        loadConnections();
    }, []);

    // Phase 3.2: If navigated here with prefillName, open Add modal pre-filled
    useEffect(() => {
        if (params.prefillName) {
            setNewName(params.prefillName);
            setIsAddModalVisible(true);
        }
    }, [params.prefillName]);

    // Pulse animation for recording indicator
    useEffect(() => {
        if (isRecording) {
            Animated.loop(
                Animated.sequence([
                    Animated.timing(pulseAnim, { toValue: 1.4, duration: 700, useNativeDriver: true }),
                    Animated.timing(pulseAnim, { toValue: 1, duration: 700, useNativeDriver: true }),
                ])
            ).start();
        } else {
            pulseAnim.stopAnimation();
            pulseAnim.setValue(1);
        }
    }, [isRecording]);

    const loadConnections = async () => {
        const stored = await localStorage.getConnections();
        setConnections(stored);

        // Compute relational metadata for the physics engine
        const allMemories = await localStorage.getMemories();
        const meta: ConnectionMetadata[] = stored.map(conn => {
            const connMemories = allMemories.filter(
                m => m.mentionedConnections && m.mentionedConnections.includes(conn.id)
            );

            const sorted = [...connMemories].sort(
                (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
            );

            const lastInteractionDate = sorted[0]?.createdAt ?? null;
            const dominantEmotion = sorted[0]?.emotion ?? null;

            return {
                connectionId: conn.id,
                memoryCount: connMemories.length,
                lastInteractionDate,
                dominantEmotion,
            };
        });
        setConnectionMetadata(meta);
    };

    const handleNodePress = async (connection: Connection) => {
        setSelectedConnection(connection);
        setCopilotSummary('');
        setIsLoadingCopilot(false);
        let memories: any[] = [];
        try {
            memories = await localStorage.getMemoriesByConnection(connection.id);
            setConnectionMemories(memories);
        } catch (e) {
            setConnectionMemories([]);
        }

        // Phase 3.3: Smart-cache copilot summary
        // Only regenerate if memory count changed since last generation
        const conn = await localStorage.getConnections().then(cs => cs.find(c => c.id === connection.id));
        const cachedSummary = conn?.copilotSummary || '';
        const cachedCount = conn?.copilotSummaryMemoryCount ?? -1;

        if (memories.length === 0) {
            setCopilotSummary(''); // No memories, no summary
            return;
        }

        if (cachedSummary && cachedCount === memories.length) {
            // Cache is valid - same memory count
            setCopilotSummary(cachedSummary);
            return;
        }

        // Fetch fresh summary in background
        setIsLoadingCopilot(true);
        try {
            const backendUrl = process.env.EXPO_PUBLIC_BACKEND_URL || '';
            const lastTranscriptions = [...memories]
                .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
                .slice(0, 10)
                .map(m => m.transcription || '')
                .filter(Boolean);

            const resp = await fetch(`${backendUrl}/api/connection-summary`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    connection_name: connection.name,
                    connection_relationship: connection.relationship,
                    memories: lastTranscriptions,
                }),
            });

            if (resp.ok) {
                const data = await resp.json();
                const newSummary = data.summary || '';
                setCopilotSummary(newSummary);
                // Persist to cache
                if (newSummary) {
                    await localStorage.updateConnectionCopilotSummary(connection.id, newSummary, memories.length);
                }
            }
        } catch (e) {
            console.log('Copilot summary failed silently:', e);
        } finally {
            setIsLoadingCopilot(false);
        }
    };

    const closeNodeDetails = () => {
        setSelectedConnection(null);
        setConnectionMemories([]);
        setCopilotSummary('');
        setIsLoadingCopilot(false);
        // Stop any playing essence audio
        if (soundRef.current) {
            soundRef.current.stopAsync().catch(() => { });
            soundRef.current.unloadAsync().catch(() => { });
            soundRef.current = null;
        }
        setIsPlayingEssence(false);
    };

    const toggleEssencePlayback = async (uri: string) => {
        if (isPlayingEssence && soundRef.current) {
            await soundRef.current.stopAsync();
            await soundRef.current.unloadAsync();
            soundRef.current = null;
            setIsPlayingEssence(false);
            return;
        }
        try {
            await Audio.setAudioModeAsync({ allowsRecordingIOS: false, playsInSilentModeIOS: true });
            const { sound } = await Audio.Sound.createAsync(
                { uri },
                { shouldPlay: true },
                (status) => {
                    if (status.isLoaded && status.didJustFinish) {
                        setIsPlayingEssence(false);
                        soundRef.current = null;
                    }
                }
            );
            soundRef.current = sound;
            setIsPlayingEssence(true);
        } catch (e) {
            console.log('Failed to play essence:', e);
            setIsPlayingEssence(false);
        }
    };

    const resetAddModal = () => {
        setNewName('');
        setNewRelation('');
        setNewPhotoUri(null);
        setNewSignatureUri(null);
        setIsRecording(false);
        setRecordingDuration(0);
        if (recordingTimer.current) clearInterval(recordingTimer.current);
    };

    const handleAddPress = () => {
        resetAddModal();
        setIsAddModalVisible(true);
    };

    // --- IMAGE PICKER ---
    const handlePickPhoto = async () => {
        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (status !== 'granted') return;

        const result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ImagePicker.MediaTypeOptions.Images,
            allowsEditing: true,
            aspect: [1, 1],
            quality: 0.3,
        });

        if (!result.canceled && result.assets[0]) {
            setNewPhotoUri(result.assets[0].uri);
        }
    };

    // --- VOICE ESSENCE RECORDING ---
    const handleStartRecording = async () => {
        try {
            await Audio.requestPermissionsAsync();
            await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });

            const { recording } = await Audio.Recording.createAsync(
                Audio.RecordingOptionsPresets.HIGH_QUALITY
            );
            setRecordingObj(recording);
            setIsRecording(true);
            setRecordingDuration(0);
            recordingTimer.current = setInterval(() => {
                setRecordingDuration(d => d + 1);
            }, 1000);
        } catch (e) {
            console.error('Failed to start recording:', e);
        }
    };

    const handleStopRecording = async () => {
        if (!recordingObj) return;
        setIsRecording(false);
        if (recordingTimer.current) clearInterval(recordingTimer.current);

        try {
            await recordingObj.stopAndUnloadAsync();
            const tmpUri = recordingObj.getURI();
            setRecordingObj(null);

            if (tmpUri) {
                try {
                    // Safety guard: move from cache to permanent directory using next API
                    const { Paths } = await import('expo-file-system/next');
                    const fileName = `essence_${Date.now()}.m4a`;
                    const permanentUri = Paths.document.uri + fileName;
                    await FileSystem.moveAsync({ from: tmpUri, to: permanentUri });
                    setNewSignatureUri(permanentUri);
                } catch {
                    // Fallback: keep in cache if move fails
                    setNewSignatureUri(tmpUri);
                }
            }
        } catch (e) {
            console.error('Failed to stop recording:', e);
        }
    };

    const formatDuration = (s: number) => {
        const m = Math.floor(s / 60).toString().padStart(2, '0');
        const sec = (s % 60).toString().padStart(2, '0');
        return `${m}:${sec}`;
    };

    // --- SAVE ---
    const saveNewConnection = async () => {
        if (!newName.trim()) return;

        const newConn: Connection = {
            id: Date.now().toString(),
            userId: 'user',
            name: newName.trim(),
            relationship: newRelation.trim() || 'Desconhecido',
            photoUri: newPhotoUri || undefined,
            signatureMemoryId: newSignatureUri || undefined,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            synced: false,
        };

        await localStorage.saveConnection(newConn);
        setIsAddModalVisible(false);
        resetAddModal();
        loadConnections();
    };

    return (
        <SafeAreaView style={styles.container} edges={['top']}>
            <View style={styles.header}>
                <Text style={styles.title}>Conexões</Text>
                <Text style={styles.subtitle}>Sua constelação de pessoas e memórias</Text>
            </View>

            <View style={styles.content}>
                <ConnectionsMap
                    connections={connections}
                    metadata={connectionMetadata}
                    onNodePress={handleNodePress}
                    onAddPress={handleAddPress}
                />
            </View>

            {/* Connection Details BottomSheet */}
            <Modal
                visible={!!selectedConnection}
                animationType="slide"
                transparent={true}
                onRequestClose={closeNodeDetails}
            >
                <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={closeNodeDetails}>
                    <TouchableOpacity activeOpacity={1} onPress={(e) => e.stopPropagation()}>
                        <View style={[styles.modalContent, styles.detailsContent]}>
                            <View style={styles.modalDragIndicator} />

                            {selectedConnection && (
                                <>
                                    <View style={styles.detailsHeader}>
                                        <View style={styles.detailsAvatar}>
                                            {selectedConnection.photoUri ? (
                                                <Image
                                                    source={{ uri: selectedConnection.photoUri }}
                                                    style={styles.detailsAvatarImage}
                                                />
                                            ) : (
                                                <Ionicons name="person" size={40} color="#a78bfa" />
                                            )}
                                            {/* Essence play badge */}
                                            {selectedConnection.signatureMemoryId && (
                                                <TouchableOpacity
                                                    style={styles.essencePlayBadge}
                                                    onPress={() => toggleEssencePlayback(selectedConnection.signatureMemoryId!)}
                                                >
                                                    <Ionicons
                                                        name={isPlayingEssence ? 'stop' : 'play'}
                                                        size={12}
                                                        color="#fff"
                                                    />
                                                </TouchableOpacity>
                                            )}
                                        </View>
                                        <View style={styles.detailsTitleContainer}>
                                            <Text style={styles.detailsName}>{selectedConnection.name}</Text>
                                            <Text style={styles.detailsRelationship}>{selectedConnection.relationship}</Text>
                                            {selectedConnection.signatureMemoryId && (
                                                <TouchableOpacity
                                                    style={styles.essenceLabel}
                                                    onPress={() => toggleEssencePlayback(selectedConnection.signatureMemoryId!)}
                                                >
                                                    <Ionicons
                                                        name={isPlayingEssence ? 'stop-circle-outline' : 'play-circle-outline'}
                                                        size={14}
                                                        color="#a78bfa"
                                                    />
                                                    <Text style={styles.essenceLabelText}>
                                                        {isPlayingEssence ? 'Parar essência' : 'Ouvir essência'}
                                                    </Text>
                                                </TouchableOpacity>
                                            )}
                                        </View>
                                        <TouchableOpacity style={styles.detailsCloseBtn} onPress={closeNodeDetails}>
                                            <Ionicons name="close-circle-outline" size={28} color="#6b7280" />
                                        </TouchableOpacity>
                                    </View>

                                    <View style={styles.detailsActionRow}>
                                        <TouchableOpacity style={styles.detailsActionButton}>
                                            <Ionicons name="mic-outline" size={20} color="#fff" />
                                            <Text style={styles.detailsActionText}>Gravar Memória</Text>
                                        </TouchableOpacity>
                                        <TouchableOpacity style={[styles.detailsActionButton, styles.detailsActionButtonSecondary]}>
                                            <Ionicons name="share-outline" size={20} color="#8b5cf6" />
                                            <Text style={styles.detailsActionTextSecondary}>Compartilhar</Text>
                                        </TouchableOpacity>
                                    </View>

                                    <Text style={styles.detailsSectionTitle}>
                                        Memórias ({connectionMemories.length})
                                    </Text>

                                    {connectionMemories.length === 0 ? (
                                        <View style={styles.detailsEmptyState}>
                                            <Ionicons name="planet-outline" size={48} color="#4b5563" />
                                            <Text style={styles.detailsEmptyTitle}>
                                                A órbita de {selectedConnection.name} está vazia.
                                            </Text>
                                            <Text style={styles.detailsEmptySubtitle}>
                                                Toque em "Gravar Memória" para registar o primeiro momento juntos.
                                            </Text>
                                            <View style={styles.detailsEmptyArrow}>
                                                <Ionicons name="arrow-up-outline" size={20} color="#8b5cf6" />
                                            </View>
                                        </View>
                                    ) : (
                                        <View style={styles.detailsMemoriesList}>
                                            {/* Phase 3.3: Copiloto Relacional block */}
                                            {(copilotSummary || isLoadingCopilot) && (
                                                <View style={styles.copilotCard}>
                                                    <View style={styles.copilotHeader}>
                                                        <Ionicons name="sparkles" size={14} color="#a78bfa" />
                                                        <Text style={styles.copilotLabel}>Copiloto Relacional</Text>
                                                    </View>
                                                    {isLoadingCopilot ? (
                                                        <ActivityIndicator size="small" color="#8b5cf6" style={{ marginTop: 8 }} />
                                                    ) : (
                                                        <Text style={styles.copilotText}>{copilotSummary}</Text>
                                                    )}
                                                </View>
                                            )}
                                            {connectionMemories.slice(0, 3).map((mem) => (
                                                <TouchableOpacity key={mem.id} style={styles.detailsMemoryCard}>
                                                    <Text style={styles.detailsMemoryEmoji}>{mem.emotionEmoji || '💭'}</Text>
                                                    <View style={styles.detailsMemoryInfo}>
                                                        <Text style={styles.detailsMemoryText} numberOfLines={2}>
                                                            {mem.transcription || 'Sem título'}
                                                        </Text>
                                                        <Text style={styles.detailsMemoryDate}>
                                                            {new Date(mem.createdAt).toLocaleDateString('pt-BR')}
                                                        </Text>
                                                    </View>
                                                </TouchableOpacity>
                                            ))}
                                            {connectionMemories.length > 3 && (
                                                <TouchableOpacity style={styles.detailsViewAllBtn}>
                                                    <Text style={styles.detailsViewAllText}>Ver todas</Text>
                                                </TouchableOpacity>
                                            )}
                                        </View>
                                    )}
                                </>
                            )}
                        </View>
                    </TouchableOpacity>
                </TouchableOpacity>
            </Modal>

            {/* Add Connection Modal */}
            <Modal
                visible={isAddModalVisible}
                animationType="slide"
                transparent={true}
                onRequestClose={() => { setIsAddModalVisible(false); resetAddModal(); }}
            >
                <View style={styles.modalOverlay}>
                    <View style={styles.modalContent}>
                        <View style={styles.modalHeader}>
                            <Text style={styles.modalTitle}>Adicionar Conexão</Text>
                            <TouchableOpacity onPress={() => { setIsAddModalVisible(false); resetAddModal(); }}>
                                <Ionicons name="close" size={24} color="#9ca3af" />
                            </TouchableOpacity>
                        </View>

                        {/* Avatar Picker */}
                        <TouchableOpacity style={styles.avatarPickerContainer} onPress={handlePickPhoto}>
                            {newPhotoUri ? (
                                <Image source={{ uri: newPhotoUri }} style={styles.avatarPickerImage} />
                            ) : (
                                <View style={styles.avatarPickerPlaceholder}>
                                    <Ionicons name="camera-outline" size={32} color="#8b5cf6" />
                                    <Text style={styles.avatarPickerText}>Adicionar Foto</Text>
                                </View>
                            )}
                            {newPhotoUri && (
                                <View style={styles.avatarPickerEditBadge}>
                                    <Ionicons name="pencil" size={14} color="#fff" />
                                </View>
                            )}
                        </TouchableOpacity>

                        <Text style={styles.inputLabel}>Nome da pessoa</Text>
                        <TextInput
                            style={styles.input}
                            value={newName}
                            onChangeText={setNewName}
                            placeholder="Ex: Vó Maria"
                            placeholderTextColor="#6b7280"
                        />

                        <Text style={styles.inputLabel}>Qual a relação?</Text>
                        <TextInput
                            style={styles.input}
                            value={newRelation}
                            onChangeText={setNewRelation}
                            placeholder="Ex: Avó, Amigo de infância..."
                            placeholderTextColor="#6b7280"
                        />

                        {/* Essence Recorder */}
                        <View style={styles.essenceContainer}>
                            {!newSignatureUri ? (
                                <TouchableOpacity
                                    style={[styles.essenceBtn, isRecording && styles.essenceBtnRecording]}
                                    onPress={isRecording ? handleStopRecording : handleStartRecording}
                                >
                                    <Animated.View style={[styles.essenceDot, { transform: [{ scale: pulseAnim }] }]} />
                                    <Ionicons
                                        name={isRecording ? 'stop-circle-outline' : 'mic-outline'}
                                        size={18}
                                        color={isRecording ? '#ef4444' : '#8b5cf6'}
                                    />
                                    <Text style={[styles.essenceBtnText, isRecording && styles.essenceBtnTextRecording]}>
                                        {isRecording
                                            ? `Gravando... ${formatDuration(recordingDuration)}`
                                            : 'Gravar Essência (Opcional)'}
                                    </Text>
                                </TouchableOpacity>
                            ) : (
                                <View style={styles.essenceRecorded}>
                                    <Ionicons name="checkmark-circle" size={20} color="#10b981" />
                                    <Text style={styles.essenceRecordedText}>Essência gravada!</Text>
                                    <TouchableOpacity onPress={() => setNewSignatureUri(null)}>
                                        <Ionicons name="trash-outline" size={18} color="#ef4444" />
                                    </TouchableOpacity>
                                </View>
                            )}
                        </View>

                        <TouchableOpacity
                            style={[styles.saveBtn, !newName.trim() && styles.saveBtnDisabled]}
                            onPress={saveNewConnection}
                            disabled={!newName.trim()}
                        >
                            <Text style={styles.saveBtnText}>Adicionar à Constelação</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#0a0a0f' },
    header: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 12, backgroundColor: '#0a0a0f', zIndex: 10 },
    title: { fontSize: 26, fontWeight: 'bold', color: '#fff' },
    subtitle: { fontSize: 14, color: '#6b7280', marginTop: 2 },
    content: { flex: 1 },

    // Modal Base
    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
    modalContent: { backgroundColor: '#12121a', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24 },
    modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 },
    modalTitle: { fontSize: 20, color: '#fff', fontWeight: 'bold' },
    modalDragIndicator: { width: 40, height: 4, backgroundColor: '#4b5563', borderRadius: 2, alignSelf: 'center', marginBottom: 20 },

    // Add Modal - Avatar
    avatarPickerContainer: {
        alignSelf: 'center',
        marginBottom: 24,
        position: 'relative',
    },
    avatarPickerPlaceholder: {
        width: 96,
        height: 96,
        borderRadius: 48,
        backgroundColor: 'rgba(139, 92, 246, 0.1)',
        borderWidth: 2,
        borderColor: 'rgba(139, 92, 246, 0.4)',
        borderStyle: 'dashed',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
    },
    avatarPickerText: { color: '#8b5cf6', fontSize: 12, fontWeight: '600' },
    avatarPickerImage: { width: 96, height: 96, borderRadius: 48, borderWidth: 2, borderColor: '#8b5cf6' },
    avatarPickerEditBadge: {
        position: 'absolute', bottom: 0, right: 0,
        width: 26, height: 26, borderRadius: 13,
        backgroundColor: '#8b5cf6',
        alignItems: 'center', justifyContent: 'center',
        borderWidth: 2, borderColor: '#12121a',
    },

    // Add Modal - Inputs
    inputLabel: { color: '#9ca3af', fontSize: 14, marginBottom: 8 },
    input: {
        backgroundColor: '#1a1a24', borderWidth: 1, borderColor: '#2d2d3a',
        borderRadius: 12, padding: 16, color: '#fff', fontSize: 16, marginBottom: 20,
    },

    // Add Modal - Essence Recorder
    essenceContainer: { marginBottom: 24 },
    essenceBtn: {
        flexDirection: 'row', alignItems: 'center', gap: 10,
        borderWidth: 1, borderColor: 'rgba(139, 92, 246, 0.4)',
        backgroundColor: 'rgba(139, 92, 246, 0.08)',
        borderRadius: 12, paddingVertical: 14, paddingHorizontal: 18,
    },
    essenceBtnRecording: {
        borderColor: 'rgba(239, 68, 68, 0.4)',
        backgroundColor: 'rgba(239, 68, 68, 0.08)',
    },
    essenceDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#ef4444', opacity: 0 },
    essenceBtnText: { color: '#a78bfa', fontSize: 14, fontWeight: '600', flex: 1 },
    essenceBtnTextRecording: { color: '#ef4444' },
    essenceRecorded: {
        flexDirection: 'row', alignItems: 'center', gap: 10,
        backgroundColor: 'rgba(16, 185, 129, 0.08)', borderWidth: 1,
        borderColor: 'rgba(16, 185, 129, 0.3)', borderRadius: 12,
        paddingVertical: 14, paddingHorizontal: 18,
    },
    essenceRecordedText: { flex: 1, color: '#10b981', fontSize: 14, fontWeight: '600' },

    // Add Modal - Save
    saveBtn: { backgroundColor: '#8b5cf6', borderRadius: 12, padding: 16, alignItems: 'center', marginTop: 4 },
    saveBtnDisabled: { backgroundColor: '#4b5563', opacity: 0.7 },
    saveBtnText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },

    // Details BottomSheet
    detailsContent: { paddingTop: 12, paddingBottom: 40 },
    detailsHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 24 },
    detailsAvatar: {
        width: 60, height: 60, borderRadius: 30,
        backgroundColor: 'rgba(167, 139, 250, 0.1)',
        alignItems: 'center', justifyContent: 'center',
        borderWidth: 1, borderColor: 'rgba(167, 139, 250, 0.3)',
        overflow: 'hidden',
        position: 'relative',
    },
    essencePlayBadge: {
        position: 'absolute', bottom: 0, right: 0,
        width: 22, height: 22, borderRadius: 11,
        backgroundColor: '#8b5cf6',
        alignItems: 'center', justifyContent: 'center',
        borderWidth: 2, borderColor: '#12121a',
        zIndex: 2,
    },
    detailsAvatarImage: { width: 60, height: 60, borderRadius: 30 },
    detailsTitleContainer: { flex: 1, marginLeft: 16 },
    detailsName: { fontSize: 22, fontWeight: 'bold', color: '#fff' },
    detailsRelationship: { fontSize: 14, color: '#9ca3af', marginTop: 4 },
    essenceLabel: {
        flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 8,
    },
    essenceLabelText: { color: '#a78bfa', fontSize: 13, fontWeight: '600' },
    detailsCloseBtn: { padding: 4 },
    detailsActionRow: { flexDirection: 'row', gap: 12, marginBottom: 32 },
    detailsActionButton: {
        flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
        backgroundColor: '#8b5cf6', paddingVertical: 14, borderRadius: 12, gap: 8,
    },
    detailsActionButtonSecondary: {
        backgroundColor: 'rgba(139, 92, 246, 0.1)',
        borderWidth: 1, borderColor: 'rgba(139, 92, 246, 0.3)',
    },
    detailsActionText: { color: '#fff', fontWeight: '600', fontSize: 15 },
    detailsActionTextSecondary: { color: '#8b5cf6', fontWeight: '600', fontSize: 15 },
    detailsSectionTitle: { fontSize: 18, fontWeight: 'bold', color: '#fff', marginBottom: 16 },

    // Details - Empty State (Dynamic CTA)
    detailsEmptyState: {
        alignItems: 'center', justifyContent: 'center', paddingVertical: 32,
        backgroundColor: '#1a1a24', borderRadius: 16,
        borderWidth: 1, borderColor: '#2d2d3a',
    },
    detailsEmptyTitle: {
        color: '#d1d5db', fontSize: 15, fontWeight: '600',
        marginTop: 16, textAlign: 'center', paddingHorizontal: 20,
    },
    detailsEmptySubtitle: {
        color: '#9ca3af', fontSize: 13, lineHeight: 20,
        marginTop: 8, textAlign: 'center', paddingHorizontal: 24,
    },
    detailsEmptyArrow: {
        marginTop: 16,
        backgroundColor: 'rgba(139, 92, 246, 0.15)',
        width: 36, height: 36, borderRadius: 18,
        alignItems: 'center', justifyContent: 'center',
        borderWidth: 1, borderColor: 'rgba(139, 92, 246, 0.3)',
    },

    // Details - Memory list
    detailsMemoriesList: { gap: 12 },
    detailsMemoryCard: {
        flexDirection: 'row', alignItems: 'center', backgroundColor: '#1a1a24',
        padding: 16, borderRadius: 16, gap: 12, borderWidth: 1, borderColor: '#2d2d3a',
    },
    detailsMemoryEmoji: { fontSize: 24 },
    detailsMemoryInfo: { flex: 1 },
    detailsMemoryText: { color: '#fff', fontSize: 15, lineHeight: 20 },
    detailsMemoryDate: { color: '#6b7280', fontSize: 12, marginTop: 4 },
    detailsViewAllBtn: { paddingVertical: 12, alignItems: 'center' },
    detailsViewAllText: { color: '#a78bfa', fontSize: 14, fontWeight: '600' },

    // Phase 3.3: Copiloto Relacional card
    copilotCard: {
        backgroundColor: 'rgba(139, 92, 246, 0.07)',
        borderWidth: 1, borderColor: 'rgba(139, 92, 246, 0.22)',
        borderRadius: 16, padding: 14, marginBottom: 4,
    },
    copilotHeader: {
        flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8,
    },
    copilotLabel: {
        fontSize: 11, fontWeight: '700', color: '#a78bfa',
        textTransform: 'uppercase', letterSpacing: 0.8,
    },
    copilotText: {
        color: '#d1d5db', fontSize: 14, lineHeight: 21, fontStyle: 'italic',
    },
});
