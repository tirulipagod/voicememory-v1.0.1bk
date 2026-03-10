import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  TextInput,
  Modal,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, router } from 'expo-router';
import { useAuth } from '../../src/contexts/AuthContext';
import { localStorage, LocalMemory } from '../../src/services/LocalStorage';
import { Audio } from 'expo-av';
import { File, Paths } from 'expo-file-system/next';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import Slider from '@react-native-community/slider';
import * as ImagePicker from 'expo-image-picker';
import { Image } from 'expo-image';

interface Segment {
  text: string;
  start_time: number;
  end_time: number;
}

interface EmotionDetail {
  emotion: string;
  emoji: string;
  intensity: number;
}

interface Memory {
  id: string;
  transcription: string;
  emotion: string;
  emotion_emoji: string;
  mood_score: number;
  audio_base64: string | null;
  duration_seconds: number | null;
  detected_date: string | null;
  memory_date: string | null;
  segments: Segment[];
  emotions?: EmotionDetail[];
  summary?: string;
  photo_url?: string;
  created_at: string;
  updated_at: string | null;
  mentioned_connections?: string[];
}

export default function MemoryDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user, syncWithDrive } = useAuth();
  const [memory, setMemory] = useState<Memory | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isPlaying, setIsPlaying] = useState(false);
  const [sound, setSound] = useState<Audio.Sound | null>(null);
  const [playbackPosition, setPlaybackPosition] = useState(0);
  const [playbackDuration, setPlaybackDuration] = useState(0);
  const [currentSegmentIndex, setCurrentSegmentIndex] = useState(-1);
  const [isEditing, setIsEditing] = useState(false);
  const [editedTranscription, setEditedTranscription] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [editedDate, setEditedDate] = useState('');
  const [showEmotionsDetail, setShowEmotionsDetail] = useState(false);
  const [isEditingEmotion, setIsEditingEmotion] = useState(false);
  // Estados para modais de exclusão (substitui Alert.alert problemático no Web)
  const [isDeleteModalVisible, setIsDeleteModalVisible] = useState(false);
  const [isDeleteAudioModalVisible, setIsDeleteAudioModalVisible] = useState(false);
  const [connectionsMap, setConnectionsMap] = useState<Record<string, string>>({});

  // Mapa de emojis para emoções que podem vir sem emoji correto
  const EMOTION_EMOJI_MAP: { [key: string]: string } = {
    'feliz': '😊',
    'triste': '😢',
    'ansioso': '😰',
    'calmo': '😌',
    'animado': '🎉',
    'frustrado': '😫',
    'grato': '🙏',
    'nostálgico': '🥹',
    'nostalgico': '🥹',
    'nostaugic_face': '🥹',
    'nostalgic_face': '🥹',
    'esperançoso': '🌟',
    'cansado': '😴',
    'neutro': '😐',
    'apaixonado': '❤️',
    'irritado': '😠',
    'surpreso': '😲',
    'confuso': '😕',
    'orgulhoso': '💪',
    'aliviado': '😮‍💨',
    'entediado': '😒',
    'preocupado': '😟',
    'saudoso': '💭',
    'reflexivo': '🤔',
    'empolgado': '🤩',
    'melancolico': '😔',
    'melancólico': '😔',
    'sobrecarregado': '😵',
    'solitário': '😞',
    'inspirado': '✨',
    'nervoso': '😬',
    'decepcionado': '😞',
    'motivado': '🔥',
    'sereno': '🕊️',
    'contente': '😄',
    'envergonhado': '😳',
    'constrangido': '😳',
    'satisfied': '😊',
    'happy': '😊',
    'sad': '😢',
    'anxious': '😰',
    'calm': '😌',
    'grateful': '🙏',
    'nostalgic': '🥹',
    'frustrated': '😫',
    'hopeful': '🌟',
    'tired': '😴',
    'neutral': '😐',
    'angry': '😠',
    'surprised': '😲',
    'confused': '😕',
    'proud': '💪',
    'relieved': '😮‍💨',
    'bored': '😒',
    'worried': '😟',
    'excited': '🎉',
    'loving': '❤️',
    'peaceful': '🕊️',
    'melancholic': '😔',
    'reflective': '🤔',
    'content': '😄',
    'overwhelmed': '😵',
    'lonely': '😞',
    'inspired': '✨',
    'nervous': '😬',
    'disappointed': '😞',
    'motivated': '🔥',
  };

  const getEmoji = (emotion: string, providedEmoji?: string): string => {
    // Se o emoji fornecido parece válido (é curto e não é uma palavra), use-o
    if (providedEmoji && providedEmoji.length <= 4 && !/^[a-zA-Z]+$/.test(providedEmoji.trim())) {
      return providedEmoji;
    }
    // Caso contrário, busque no mapa
    return EMOTION_EMOJI_MAP[emotion.toLowerCase()] || '💭';
  };

  useEffect(() => {
    fetchMemory();
    return () => {
      if (sound) {
        sound.unloadAsync();
      }
    };
  }, [id]);

  const fetchMemory = async () => {
    try {
      // Get memory from local storage
      const localMemory = await localStorage.getMemoryById(id as string);

      if (!localMemory) {
        Alert.alert('Erro', 'Memória não encontrada');
        router.back();
        return;
      }

      // Fetch connections to resolve names
      const localConnections = await localStorage.getConnections();
      const connMap: Record<string, string> = {};
      localConnections.forEach(c => {
        connMap[c.id] = c.name;
      });
      setConnectionsMap(connMap);

      // Transform to Memory interface
      const transformedMemory: Memory = {
        id: localMemory.id,
        transcription: localMemory.transcription,
        emotion: localMemory.emotion,
        emotion_emoji: localMemory.emotionEmoji,
        mood_score: localMemory.moodScore,
        audio_base64: localMemory.audioBase64 || null,
        duration_seconds: localMemory.durationSeconds || null,
        detected_date: null,
        memory_date: localMemory.memoryDate || null,
        segments: localMemory.segments?.map(s => ({
          text: s.text,
          start_time: s.startTime,
          end_time: s.endTime,
        })) || [],
        emotions: localMemory.emotions,
        summary: localMemory.summary,
        photo_url: localMemory.photoUrl,
        created_at: localMemory.createdAt,
        updated_at: localMemory.updatedAt,
        mentioned_connections: localMemory.mentionedConnections || [],
      };

      setMemory(transformedMemory);
      setEditedTranscription(transformedMemory.transcription);
      setEditedDate(transformedMemory.memory_date || '');
    } catch (error) {
      console.error('Error fetching memory:', error);
      Alert.alert('Erro', 'Não foi possível carregar a memória');
      router.back();
    } finally {
      setIsLoading(false);
    }
  };

  const loadAndPlayAudio = async () => {
    if (!memory?.audio_base64) {
      console.log('No audio to play');
      Alert.alert('Erro', 'Nenhum áudio disponível');
      return;
    }

    try {
      console.log('Loading audio, sound exists:', !!sound);

      if (sound) {
        const status = await sound.getStatusAsync();
        console.log('Sound status:', status.isLoaded, 'isPlaying:', isPlaying);
        if (status.isLoaded) {
          if (isPlaying) {
            await sound.pauseAsync();
            setIsPlaying(false);
          } else {
            await sound.playAsync();
            setIsPlaying(true);
          }
          return;
        }
      }

      // Set audio mode
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        playsInSilentModeIOS: true,
        staysActiveInBackground: false,
        shouldDuckAndroid: true,
      });

      console.log('Creating new sound...');

      // Save base64 to a temporary file for better compatibility using new File API
      const tempFileName = `temp_audio_${memory.id}.m4a`;
      const tempFile = new File(Paths.cache, tempFileName);

      let fileExists = false;
      try {
        fileExists = tempFile.exists;
        console.log('File exists check:', fileExists);
      } catch (e) {
        console.log('Error checking file existence:', e);
        fileExists = false;
      }

      if (!fileExists) {
        try {
          // Write base64 audio to file
          tempFile.create();
          tempFile.write(memory.audio_base64, { encoding: 'base64' });
          console.log('Audio file written to:', tempFile.uri);
        } catch (writeError) {
          console.log('Error writing audio file:', writeError);
        }
      }

      // Determine audio source
      let audioSource: { uri: string };
      try {
        if (tempFile.exists) {
          audioSource = { uri: tempFile.uri };
          console.log('Loading from file:', tempFile.uri);
        } else {
          audioSource = { uri: `data:audio/m4a;base64,${memory.audio_base64}` };
          console.log('Loading from data URI');
        }
      } catch (e) {
        console.log('Fallback to data URI due to error:', e);
        audioSource = { uri: `data:audio/m4a;base64,${memory.audio_base64}` };
      }

      const { sound: newSound } = await Audio.Sound.createAsync(
        audioSource,
        { shouldPlay: true },
        onPlaybackStatusUpdate
      );

      console.log('Sound created successfully');
      setSound(newSound);
      setIsPlaying(true);
    } catch (error) {
      console.error('Error playing audio:', error);
      Alert.alert('Erro', 'Não foi possível reproduzir o áudio: ' + (error as Error).message);
    }
  };

  const onPlaybackStatusUpdate = (status: any) => {
    if (status.isLoaded) {
      setPlaybackPosition(status.positionMillis / 1000);
      setPlaybackDuration(status.durationMillis / 1000);

      if (status.didJustFinish) {
        setIsPlaying(false);
        setPlaybackPosition(0);
        setCurrentSegmentIndex(-1);
      }

      // Find current segment based on position
      if (memory?.segments && memory.segments.length > 0) {
        const positionSec = status.positionMillis / 1000;
        const idx = memory.segments.findIndex(
          (seg) => positionSec >= seg.start_time && positionSec < seg.end_time
        );
        setCurrentSegmentIndex(idx);
      }
    }
  };

  const seekTo = async (positionSec: number) => {
    if (sound) {
      await sound.setPositionAsync(positionSec * 1000);
      setPlaybackPosition(positionSec);
    }
  };

  const seekToSegment = async (segment: Segment) => {
    if (!sound) {
      await loadAndPlayAudio();
      // Wait a bit for sound to load
      setTimeout(() => seekTo(segment.start_time), 500);
    } else {
      await seekTo(segment.start_time);
      if (!isPlaying) {
        await sound.playAsync();
        setIsPlaying(true);
      }
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const saveChanges = async () => {
    if (!memory) return;

    try {
      setIsSaving(true);

      // Get current memory from local storage
      const localMemory = await localStorage.getMemoryById(memory.id);
      if (!localMemory) {
        throw new Error('Memory not found');
      }

      // Update memory locally
      const updatedLocalMemory: LocalMemory = {
        ...localMemory,
        transcription: editedTranscription,
        memoryDate: editedDate || undefined,
        updatedAt: new Date().toISOString(),
        synced: false,
      };

      await localStorage.saveMemory(updatedLocalMemory);

      // Update state
      setMemory({
        ...memory,
        transcription: editedTranscription,
        memory_date: editedDate || null,
        updated_at: updatedLocalMemory.updatedAt,
      });

      setIsEditing(false);

      // Sync in background
      syncWithDrive().catch(err => console.log('Background sync failed:', err));

      Alert.alert('Sucesso', 'Memória atualizada!');
    } catch (error) {
      console.error('Error saving:', error);
      Alert.alert('Erro', 'Não foi possível salvar as alterações');
    } finally {
      setIsSaving(false);
    }
  };

  const pickImage = async () => {
    let result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      quality: 0.8,
    });

    if (!result.canceled && result.assets && result.assets.length > 0) {
      const uri = result.assets[0].uri;
      if (!memory) return;

      setIsSaving(true);
      try {
        const localMemory = await localStorage.getMemoryById(memory.id);
        if (localMemory) {
          const updatedMemory = {
            ...localMemory,
            photoUrl: uri,
            synced: false
          };
          await localStorage.saveMemory(updatedMemory);
          setMemory({ ...memory, photo_url: uri });
          syncWithDrive().catch(err => console.log('Background sync failed:', err));
          Alert.alert('Sucesso', 'Foto anexada à memória!');
        }
      } catch (error) {
        console.error('Error saving photo:', error);
        Alert.alert('Erro', 'Não foi possível salvar a foto');
      } finally {
        setIsSaving(false);
      }
    }
  };

  const deleteAudio = () => {
    console.log('deleteAudio called');
    // Usa modal customizado ao invés de Alert.alert (funciona melhor no Web)
    setIsDeleteAudioModalVisible(true);
  };

  const handleDeleteAudio = async () => {
    console.log('Removing audio for memory:', id);
    try {
      // Stop and unload sound first
      if (sound) {
        await sound.unloadAsync();
        setSound(null);
      }
      setIsPlaying(false);

      // Delete audio locally
      await localStorage.deleteMemoryAudio(id as string);
      console.log('Audio deleted from localStorage');

      // Also delete temp file if exists using new File API
      try {
        const tempFileName = `temp_audio_${id}.m4a`;
        const tempFile = new File(Paths.cache, tempFileName);
        if (tempFile.exists) {
          tempFile.delete();
          console.log('Temp audio file deleted');
        }
      } catch (e) {
        console.log('Error deleting temp file:', e);
      }

      // Update local state immediately
      setMemory(prev => prev ? {
        ...prev,
        audio_base64: null,
        duration_seconds: null,
        segments: []
      } : null);

      // Sync in background
      syncWithDrive().catch(err => console.log('Background sync failed:', err));

      Alert.alert('Sucesso', 'Áudio removido');
    } catch (error) {
      console.error('Error deleting audio:', error);
      Alert.alert('Erro', 'Não foi possível remover o áudio');
    }
  };

  const deleteMemory = () => {
    console.log('deleteMemory called');
    // Usa modal customizado ao invés de Alert.alert (funciona melhor no Web)
    setIsDeleteModalVisible(true);
  };

  const handleDeleteMemory = async () => {
    console.log('Deleting memory:', id);
    try {
      // Unload sound if playing
      if (sound) {
        await sound.unloadAsync();
        setSound(null);
      }

      // Delete memory locally
      await localStorage.deleteMemory(id as string);
      console.log('Memory deleted from localStorage');

      // Delete temp audio file if exists using new File API
      try {
        const tempFileName = `temp_audio_${id}.m4a`;
        const tempFile = new File(Paths.cache, tempFileName);
        if (tempFile.exists) {
          tempFile.delete();
          console.log('Temp audio file deleted');
        }
      } catch (e) {
        console.log('Error deleting temp file:', e);
      }

      // Sync in background
      syncWithDrive().catch(err => console.log('Background sync failed:', err));

      // Navigate back immediately
      router.back();
    } catch (error) {
      console.error('Error deleting memory:', error);
      Alert.alert('Erro', 'Não foi possível apagar');
    }
  };

  const getMoodColor = (score: number) => {
    if (score >= 7) return '#10b981';
    if (score <= 3) return '#ef4444';
    return '#8b5cf6';
  };

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#8b5cf6" />
        </View>
      </SafeAreaView>
    );
  }

  if (!memory) return null;

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <View style={styles.headerActions}>
          {!isEditing && (
            <TouchableOpacity style={styles.headerBtn} onPress={() => setIsEditing(true)}>
              <Ionicons name="create-outline" size={22} color="#8b5cf6" />
            </TouchableOpacity>
          )}
          <TouchableOpacity style={styles.headerBtn} onPress={deleteMemory}>
            <Ionicons name="trash-outline" size={22} color="#ef4444" />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {/* Date & Time */}
        <View style={styles.dateSection}>
          <Text style={styles.dateText}>
            {format(parseISO(memory.created_at), "EEEE, d 'de' MMMM", { locale: ptBR })}
          </Text>
          <Text style={styles.timeText}>
            {format(parseISO(memory.created_at), 'HH:mm')}
          </Text>
          {memory.memory_date && (
            <View style={styles.memoryDateBadge}>
              <Ionicons name="calendar" size={14} color="#8b5cf6" />
              <Text style={styles.memoryDateText}>
                Evento: {(() => {
                  try {
                    const date = parseISO(memory.memory_date);
                    if (isNaN(date.getTime())) return memory.memory_date;
                    return format(date, "d 'de' MMMM, yyyy", { locale: ptBR });
                  } catch {
                    return memory.memory_date;
                  }
                })()}
              </Text>
            </View>
          )}
        </View>

        {/* Emotion Card with Summary */}
        <View style={styles.emotionCard}>
          <View style={styles.emotionMainRow}>
            <Text style={styles.emotionEmoji}>{getEmoji(memory.emotion, memory.emotion_emoji)}</Text>
            <View style={styles.emotionMainInfo}>
              <TouchableOpacity
                style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}
                onPress={() => {
                  setIsEditingEmotion(true);
                  setShowEmotionsDetail(true);
                }}
              >
                <Text style={styles.emotionLabel}>{memory.emotion}</Text>
                <Ionicons name="pencil" size={14} color="#8b5cf6" />
              </TouchableOpacity>
              <View style={styles.moodContainer}>
                <View style={styles.moodBarOuter}>
                  <View style={[styles.moodBarInner, { width: `${memory.mood_score * 10}%`, backgroundColor: getMoodColor(memory.mood_score) }]} />
                </View>
                <Text style={[styles.moodScore, { color: getMoodColor(memory.mood_score) }]}>
                  {memory.mood_score}/10
                </Text>
              </View>
            </View>
          </View>

          {/* Summary */}
          {/* Summary */}
          {memory.summary && (
            <View style={styles.summaryInCard}>
              {memory.summary.includes('[ALERTA_SENSIVEL]') && (
                <TouchableOpacity
                  style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(239, 68, 68, 0.15)', padding: 12, borderRadius: 12, marginBottom: 12, borderWidth: 1, borderColor: 'rgba(239, 68, 68, 0.3)' }}
                  onPress={() => Alert.alert('Alerta de Segurança', 'Nossa IA identificou que esta gravação contém violência ou conteúdo sensível de alto risco (risco de vida, abuso, intenção criminosa, auto-mutilação). O texto a seguir contém uma recomendação automática voltada para sua proteção e suporte legal.')}
                >
                  <Ionicons name="warning" size={20} color="#ef4444" style={{ marginRight: 8 }} />
                  <Text style={{ color: '#ef4444', fontWeight: 'bold', fontSize: 13, flex: 1 }}>
                    Alerta Sensível Detectado. Toque para saber mais.
                  </Text>
                </TouchableOpacity>
              )}
              <Text style={styles.summaryText}>{memory.summary.replace('[ALERTA_SENSIVEL]', '').trim()}</Text>
            </View>
          )}

          {/* Connection Tags */}
          {memory.mentioned_connections && memory.mentioned_connections.length > 0 && (
            <View style={styles.tagsContainer}>
              {memory.mentioned_connections.map((connId) => (
                <View key={connId} style={styles.connectionTag}>
                  <Ionicons name="person-circle-outline" size={16} color="#a78bfa" />
                  <Text style={styles.connectionTagText}>
                    {connectionsMap[connId] || 'Conexão'}
                  </Text>
                </View>
              ))}
            </View>
          )}

          {/* Button to show more emotions */}
          {memory.emotions && memory.emotions.length > 1 && (
            <TouchableOpacity
              style={styles.showEmotionsBtn}
              onPress={() => setShowEmotionsDetail(!showEmotionsDetail)}
            >
              <Text style={styles.showEmotionsBtnText}>
                {showEmotionsDetail ? 'Ocultar detalhes' : `Ver ${memory.emotions.length} emoções identificadas`}
              </Text>
              <Ionicons
                name={showEmotionsDetail ? 'chevron-up' : 'chevron-down'}
                size={18}
                color="#8b5cf6"
              />
            </TouchableOpacity>
          )}

          {/* Emotions Detail (expandable) */}
          {showEmotionsDetail && memory.emotions && memory.emotions.length > 0 && (
            <View style={styles.emotionsDetailExpanded}>
              {isEditingEmotion && (
                <Text style={{ color: '#9ca3af', fontSize: 13, marginBottom: 12, textAlign: 'center' }}>
                  Toque em uma emoção para defini-la como principal
                </Text>
              )}
              {memory.emotions.map((em, index) => (
                <TouchableOpacity
                  key={index}
                  style={[styles.emotionItem, memory.emotion === em.emotion && { borderColor: '#8b5cf6', borderWidth: 1 }]}
                  activeOpacity={isEditingEmotion ? 0.2 : 1}
                  onPress={async () => {
                    if (!isEditingEmotion) return;
                    try {
                      const localMem = await localStorage.getMemoryById(memory.id);
                      if (localMem) {
                        const updated = {
                          ...localMem,
                          emotion: em.emotion,
                          emotionEmoji: em.emoji || getEmoji(em.emotion),
                          synced: false
                        };
                        await localStorage.saveMemory(updated);
                        setMemory({
                          ...memory,
                          emotion: updated.emotion,
                          emotion_emoji: updated.emotionEmoji
                        });
                        syncWithDrive().catch(e => console.log(e));
                        setIsEditingEmotion(false);
                      }
                    } catch (error) {
                      Alert.alert('Erro', 'Falha ao atualizar a emoção');
                    }
                  }}
                >
                  <Text style={styles.emotionItemEmoji}>{getEmoji(em.emotion, em.emoji)}</Text>
                  <Text style={styles.emotionItemName}>{em.emotion}</Text>
                  <View style={styles.intensityBar}>
                    <View style={[styles.intensityFill, { width: `${em.intensity}%` }]} />
                  </View>
                  <Text style={styles.intensityText}>{em.intensity}%</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>

        {/* Photo Gallery / Upload */}
        <View style={styles.photoContainer}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Memória Visual</Text>
          </View>

          {memory.photo_url ? (
            <View style={styles.photoWrapper}>
              <Image
                source={{ uri: memory.photo_url }}
                style={styles.memoryPhoto}
                contentFit="cover"
                transition={300}
              />
              <TouchableOpacity style={styles.changePhotoBtn} onPress={pickImage}>
                <Ionicons name="camera-reverse" size={16} color="#fff" />
                <Text style={styles.changePhotoText}>Trocar foto</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity style={styles.addPhotoBtn} onPress={pickImage}>
              <Ionicons name="image-outline" size={24} color="#8b5cf6" />
              <Text style={styles.addPhotoText}>Anexar foto da galeria</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Advanced Audio Player */}
        {memory.audio_base64 && (
          <View style={styles.audioPlayerContainer}>
            <View style={styles.audioPlayerHeader}>
              <Text style={styles.audioPlayerTitle}>Gravação</Text>
              <TouchableOpacity onPress={deleteAudio}>
                <Text style={styles.deleteAudioText}>Remover áudio</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.audioPlayer}>
              <TouchableOpacity style={styles.playPauseBtn} onPress={loadAndPlayAudio}>
                <Ionicons name={isPlaying ? 'pause' : 'play'} size={32} color="#fff" />
              </TouchableOpacity>

              <View style={styles.audioControls}>
                <Text style={styles.timeText}>{formatTime(playbackPosition)}</Text>
                <Slider
                  style={styles.slider}
                  minimumValue={0}
                  maximumValue={playbackDuration || memory.duration_seconds || 1}
                  value={playbackPosition}
                  onSlidingComplete={seekTo}
                  minimumTrackTintColor="#8b5cf6"
                  maximumTrackTintColor="#374151"
                  thumbTintColor="#8b5cf6"
                />
                <Text style={styles.timeText}>
                  {formatTime(playbackDuration || memory.duration_seconds || 0)}
                </Text>
              </View>
            </View>
          </View>
        )}

        {/* Transcription Section */}
        <View style={styles.transcriptionSection}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Transcrição</Text>
            {isEditing && (
              <TouchableOpacity onPress={() => setShowDatePicker(true)}>
                <Text style={styles.editDateText}>Editar data</Text>
              </TouchableOpacity>
            )}
          </View>

          {isEditing ? (
            <>
              <TextInput
                style={styles.transcriptionInput}
                value={editedTranscription}
                onChangeText={setEditedTranscription}
                multiline
                textAlignVertical="top"
              />
              <View style={styles.editActions}>
                <TouchableOpacity
                  style={styles.cancelEditBtn}
                  onPress={() => {
                    setIsEditing(false);
                    setEditedTranscription(memory.transcription);
                    setEditedDate(memory.memory_date || '');
                  }}
                >
                  <Text style={styles.cancelEditText}>Cancelar</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.saveEditBtn, isSaving && styles.saveEditBtnDisabled]}
                  onPress={saveChanges}
                  disabled={isSaving}
                >
                  {isSaving ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Text style={styles.saveEditText}>Salvar</Text>
                  )}
                </TouchableOpacity>
              </View>
            </>
          ) : (
            <>
              {/* Segments with timestamps */}
              {memory.segments && memory.segments.length > 0 && memory.audio_base64 ? (
                <View style={styles.segmentsContainer}>
                  {memory.segments.map((segment, index) => (
                    <TouchableOpacity
                      key={index}
                      style={[
                        styles.segmentItem,
                        currentSegmentIndex === index && styles.segmentItemActive
                      ]}
                      onPress={() => seekToSegment(segment)}
                    >
                      <View style={styles.segmentTime}>
                        <Ionicons
                          name={currentSegmentIndex === index ? "volume-high" : "play-circle-outline"}
                          size={16}
                          color={currentSegmentIndex === index ? "#8b5cf6" : "#6b7280"}
                        />
                        <Text style={[
                          styles.segmentTimeText,
                          currentSegmentIndex === index && styles.segmentTimeTextActive
                        ]}>
                          {formatTime(segment.start_time)}
                        </Text>
                      </View>
                      <Text style={[
                        styles.segmentText,
                        currentSegmentIndex === index && styles.segmentTextActive
                      ]}>
                        {segment.text}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              ) : (
                <Text style={styles.transcriptionText}>{memory.transcription}</Text>
              )}
            </>
          )}
        </View>

        {/* Metadata */}
        {memory.updated_at && memory.updated_at !== memory.created_at && (
          <Text style={styles.updatedText}>
            Editado em {format(parseISO(memory.updated_at), "d/MM/yyyy 'às' HH:mm", { locale: ptBR })}
          </Text>
        )}
      </ScrollView>

      {/* Date Picker Modal */}
      <Modal visible={showDatePicker} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Data da memória</Text>
            <Text style={styles.modalSubtitle}>Formato: AAAA-MM-DD (ex: 2025-01-15)</Text>
            <TextInput
              style={styles.dateInput}
              value={editedDate}
              onChangeText={setEditedDate}
              placeholder="2025-01-15"
              placeholderTextColor="#6b7280"
            />
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.modalCancelBtn}
                onPress={() => setShowDatePicker(false)}
              >
                <Text style={styles.modalCancelText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.modalSaveBtn}
                onPress={() => setShowDatePicker(false)}
              >
                <Text style={styles.modalSaveText}>OK</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Delete Memory Modal - Substitui Alert.alert para funcionar bem no Web */}
      <Modal visible={isDeleteModalVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.deleteModalHeader}>
              <Ionicons name="warning" size={32} color="#ef4444" />
            </View>
            <Text style={[styles.modalTitle, { textAlign: 'center', marginTop: 12 }]}>Apagar memória</Text>
            <Text style={[styles.modalSubtitle, { textAlign: 'center', marginBottom: 24 }]}>
              Tem certeza? Esta ação não pode ser desfeita e todos os dados desta memória serão perdidos.
            </Text>
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.modalCancelBtn}
                onPress={() => setIsDeleteModalVisible(false)}
              >
                <Text style={styles.modalCancelText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.deleteConfirmBtn}
                onPress={() => {
                  setIsDeleteModalVisible(false);
                  handleDeleteMemory();
                }}
              >
                <Text style={styles.deleteConfirmText}>Apagar Definitivamente</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Delete Audio Modal - Substitui Alert.alert para funcionar bem no Web */}
      <Modal visible={isDeleteAudioModalVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.deleteModalHeader}>
              <Ionicons name="volume-mute" size={32} color="#f59e0b" />
            </View>
            <Text style={[styles.modalTitle, { textAlign: 'center', marginTop: 12 }]}>Remover áudio</Text>
            <Text style={[styles.modalSubtitle, { textAlign: 'center', marginBottom: 24 }]}>
              Deseja remover apenas o áudio? A transcrição e análise de emoções serão mantidas.
            </Text>
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.modalCancelBtn}
                onPress={() => setIsDeleteAudioModalVisible(false)}
              >
                <Text style={styles.modalCancelText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.deleteConfirmBtn, { backgroundColor: '#f59e0b' }]}
                onPress={() => {
                  setIsDeleteAudioModalVisible(false);
                  handleDeleteAudio();
                }}
              >
                <Text style={styles.deleteConfirmText}>Remover Áudio</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a0f',
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  backButton: {
    padding: 8,
  },
  headerActions: {
    flexDirection: 'row',
    gap: 8,
  },
  headerBtn: {
    padding: 8,
  },
  content: {
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
  dateSection: {
    marginBottom: 20,
  },
  dateText: {
    fontSize: 16,
    color: '#9ca3af',
    textTransform: 'capitalize',
  },
  timeText: {
    fontSize: 13,
    color: '#6b7280',
    marginTop: 2,
  },
  memoryDateBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(139, 92, 246, 0.1)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    marginTop: 10,
    alignSelf: 'flex-start',
  },
  memoryDateText: {
    fontSize: 13,
    color: '#8b5cf6',
  },
  emotionCard: {
    backgroundColor: '#1a1a24',
    borderRadius: 20,
    padding: 20,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#2d2d3a',
  },
  emotionMainRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  emotionMainInfo: {
    flex: 1,
  },
  emotionEmoji: {
    fontSize: 48,
  },
  emotionLabel: {
    fontSize: 20,
    fontWeight: '600',
    color: '#fff',
    textTransform: 'capitalize',
  },
  moodContainer: {
    marginTop: 8,
  },
  moodBarOuter: {
    height: 6,
    backgroundColor: '#2d2d3a',
    borderRadius: 3,
    overflow: 'hidden',
  },
  moodBarInner: {
    height: '100%',
    borderRadius: 3,
  },
  moodScore: {
    fontSize: 13,
    fontWeight: '600',
    marginTop: 6,
    textAlign: 'right',
  },
  summaryInCard: {
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#2d2d3a',
  },
  summaryText: {
    fontSize: 15,
    color: '#c4b5fd',
    fontStyle: 'italic',
    lineHeight: 22,
  },
  tagsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#2d2d3a',
  },
  connectionTag: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(167, 139, 250, 0.1)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
    gap: 6,
    borderWidth: 1,
    borderColor: 'rgba(167, 139, 250, 0.2)',
  },
  connectionTagText: {
    color: '#a78bfa',
    fontSize: 13,
    fontWeight: '500',
  },
  showEmotionsBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 16,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#2d2d3a',
    gap: 6,
  },
  showEmotionsBtnText: {
    fontSize: 14,
    color: '#8b5cf6',
    fontWeight: '500',
  },
  emotionsDetailExpanded: {
    marginTop: 16,
    gap: 10,
  },
  emotionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  emotionItemEmoji: {
    fontSize: 18,
    width: 26,
  },
  emotionItemName: {
    fontSize: 14,
    color: '#fff',
    flex: 1,
    textTransform: 'capitalize',
  },
  intensityBar: {
    flex: 2,
    height: 6,
    backgroundColor: '#2d2d3a',
    borderRadius: 3,
    overflow: 'hidden',
  },
  intensityFill: {
    height: '100%',
    backgroundColor: '#8b5cf6',
    borderRadius: 3,
  },
  intensityText: {
    fontSize: 12,
    color: '#9ca3af',
    width: 35,
    textAlign: 'right',
  },
  emotionsDetailCard: {
    backgroundColor: '#1a1a24',
    borderRadius: 16,
    padding: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#2d2d3a',
  },
  photoContainer: {
    marginBottom: 20,
  },
  photoWrapper: {
    width: '100%',
    height: 250,
    borderRadius: 16,
    overflow: 'hidden',
    position: 'relative',
    borderWidth: 1,
    borderColor: '#2d2d3a',
    backgroundColor: '#1a1a24',
  },
  memoryPhoto: {
    width: '100%',
    height: '100%',
  },
  changePhotoBtn: {
    position: 'absolute',
    bottom: 12,
    right: 12,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    gap: 4,
  },
  changePhotoText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '500',
  },
  addPhotoBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    backgroundColor: '#1a1a24',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#2d2d3a',
    borderStyle: 'dashed',
    gap: 12,
  },
  addPhotoText: {
    color: '#8b5cf6',
    fontSize: 15,
    fontWeight: '500',
  },
  audioPlayerContainer: {
    backgroundColor: '#1a1a24',
    borderRadius: 16,
    padding: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#2d2d3a',
  },
  audioPlayerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  audioPlayerTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },
  deleteAudioText: {
    fontSize: 13,
    color: '#ef4444',
  },
  audioPlayer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  playPauseBtn: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#8b5cf6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  audioControls: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  slider: {
    flex: 1,
    height: 40,
  },
  transcriptionSection: {
    marginBottom: 20,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6b7280',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  editDateText: {
    fontSize: 13,
    color: '#8b5cf6',
  },
  transcriptionText: {
    fontSize: 16,
    color: '#e5e7eb',
    lineHeight: 26,
  },
  transcriptionInput: {
    backgroundColor: '#12121a',
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    color: '#fff',
    minHeight: 150,
    borderWidth: 1,
    borderColor: '#8b5cf6',
  },
  editActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 16,
  },
  cancelEditBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#374151',
    alignItems: 'center',
  },
  cancelEditText: {
    color: '#9ca3af',
    fontSize: 15,
    fontWeight: '600',
  },
  saveEditBtn: {
    flex: 2,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: '#8b5cf6',
    alignItems: 'center',
  },
  saveEditBtnDisabled: {
    backgroundColor: '#4b5563',
  },
  saveEditText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
  segmentsContainer: {
    gap: 8,
  },
  segmentItem: {
    backgroundColor: '#12121a',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#2d2d3a',
  },
  segmentItemActive: {
    backgroundColor: 'rgba(139, 92, 246, 0.1)',
    borderColor: '#8b5cf6',
  },
  segmentTime: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 6,
  },
  segmentTimeText: {
    fontSize: 12,
    color: '#6b7280',
  },
  segmentTimeTextActive: {
    color: '#8b5cf6',
  },
  segmentText: {
    fontSize: 15,
    color: '#d1d5db',
    lineHeight: 22,
  },
  segmentTextActive: {
    color: '#fff',
  },
  updatedText: {
    fontSize: 12,
    color: '#4b5563',
    textAlign: 'center',
    marginTop: 8,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  modalContent: {
    backgroundColor: '#1a1a24',
    borderRadius: 16,
    padding: 24,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 4,
  },
  modalSubtitle: {
    fontSize: 13,
    color: '#6b7280',
    marginBottom: 16,
  },
  dateInput: {
    backgroundColor: '#12121a',
    borderRadius: 10,
    padding: 14,
    fontSize: 16,
    color: '#fff',
    borderWidth: 1,
    borderColor: '#2d2d3a',
    marginBottom: 20,
  },
  modalActions: {
    flexDirection: 'row',
    gap: 12,
  },
  modalCancelBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#374151',
    alignItems: 'center',
  },
  modalCancelText: {
    color: '#9ca3af',
    fontSize: 15,
    fontWeight: '600',
  },
  modalSaveBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: '#8b5cf6',
    alignItems: 'center',
  },
  modalSaveText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
  deleteModalHeader: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteConfirmBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: '#ef4444',
    alignItems: 'center',
  },
  deleteConfirmText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
});
