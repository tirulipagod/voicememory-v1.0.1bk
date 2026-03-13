import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  Animated,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Modal,
  Dimensions,
  Easing,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Audio } from 'expo-av';
import * as Haptics from 'expo-haptics';
import { useAuth } from '../../src/contexts/AuthContext';
import { localStorage, LocalMemory } from '../../src/services/LocalStorage';
import { router } from 'expo-router';
import 'react-native-get-random-values';
import { v4 as uuidv4 } from 'uuid';
import { isToday } from 'date-fns';
import { REFLECTION_PROMPTS, GOAL_PROMPTS } from '../../src/config/Prompts';
import { getDailyChallenges } from '../../src/services/ChallengeService';

type RecordingState = 'idle' | 'recording' | 'paused' | 'transcribing' | 'preview' | 'saving';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// Sugestões reflexivas categorizadas

// ========== AI LOADING ANIMATION (Mágica da IA) ==========
const AI_LOADING_PHRASES = [
  "Acessando núcleo de processamento...",
  "A IA está lendo seus pensamentos...",
  "Conectando com inteligência emocional...",
  "Decodificando suas emoções...",
  "Processamento profundo em andamento...",
  "Analisando padrões emocionais...",
];

const AILoadingAnimation: React.FC<{ message: string }> = ({ message }) => {
  const pulseAnim = useRef(new Animated.Value(0.5)).current;
  const dotAnim1 = useRef(new Animated.Value(0)).current;
  const dotAnim2 = useRef(new Animated.Value(0)).current;
  const dotAnim3 = useRef(new Animated.Value(0)).current;
  const [currentPhrase, setCurrentPhrase] = useState(
    AI_LOADING_PHRASES[Math.floor(Math.random() * AI_LOADING_PHRASES.length)]
  );

  useEffect(() => {
    // Animação de pulso do texto
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 1000,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 0.5,
          duration: 1000,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    ).start();

    // Animação dos dots
    const animateDot = (anim: Animated.Value, delay: number) => {
      setTimeout(() => {
        Animated.loop(
          Animated.sequence([
            Animated.timing(anim, {
              toValue: 1,
              duration: 400,
              useNativeDriver: true,
            }),
            Animated.timing(anim, {
              toValue: 0,
              duration: 400,
              useNativeDriver: true,
            }),
          ])
        ).start();
      }, delay);
    };
    animateDot(dotAnim1, 0);
    animateDot(dotAnim2, 200);
    animateDot(dotAnim3, 400);

    // Troca de frase a cada 3 segundos
    const interval = setInterval(() => {
      setCurrentPhrase(AI_LOADING_PHRASES[Math.floor(Math.random() * AI_LOADING_PHRASES.length)]);
    }, 3000);

    return () => clearInterval(interval);
  }, []);

  return (
    <View style={styles.aiLoadingContainer}>
      {/* Círculo pulsante com partículas */}
      <View style={styles.aiLoadingCircleWrapper}>
        <Animated.View style={[styles.aiLoadingGlow, { opacity: pulseAnim }]} />
        <View style={styles.aiLoadingCircle}>
          <Ionicons name="sparkles" size={40} color="#fff" />
        </View>
      </View>

      {/* Texto pulsante mágico */}
      <Animated.Text
        style={[
          styles.aiLoadingText,
          { opacity: pulseAnim }
        ]}
      >
        {currentPhrase}
      </Animated.Text>

      {/* Dots animados */}
      <View style={styles.aiLoadingDots}>
        <Animated.View style={[styles.aiDot, { opacity: dotAnim1 }]} />
        <Animated.View style={[styles.aiDot, { opacity: dotAnim2 }]} />
        <Animated.View style={[styles.aiDot, { opacity: dotAnim3 }]} />
      </View>

      <Text style={styles.aiLoadingSubtext}>{message}</Text>
    </View>
  );
};

// Componente de Carrossel de Sugestões Simplificado
const PromptCarousel: React.FC<{ isVisible: boolean; interval?: number; }> = ({ isVisible, interval = 7000 }) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(10)).current;
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Embaralhar as sugestões de reflexão uma vez
  const [prompts] = useState(() => {
    const shuffled = [...REFLECTION_PROMPTS].sort(() => 0.5 - Math.random());
    return shuffled.slice(0, 5); // Pega 5 aleatórias
  });

  const animateTransition = (nextIndex: number) => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: -10,
        duration: 300,
        useNativeDriver: true,
      })
    ]).start(() => {
      setCurrentIndex(nextIndex);
      slideAnim.setValue(10);
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 400,
          useNativeDriver: true,
        }),
        Animated.timing(slideAnim, {
          toValue: 0,
          duration: 400,
          useNativeDriver: true,
        })
      ]).start();
    });
  };

  const goToNext = () => {
    const nextIndex = (currentIndex + 1) % prompts.length;
    animateTransition(nextIndex);
  };

  useEffect(() => {
    if (isVisible) {
      // Entrada inicial
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 600,
          useNativeDriver: true,
        }),
        Animated.timing(slideAnim, {
          toValue: 0,
          duration: 600,
          useNativeDriver: true,
        })
      ]).start();
    } else {
      fadeAnim.setValue(0);
      slideAnim.setValue(10);
    }
  }, [isVisible]);

  useEffect(() => {
    if (isVisible) {
      timerRef.current = setInterval(() => {
        goToNext();
      }, interval);
    }
    return () => clearInterval(timerRef.current!);
  }, [isVisible, currentIndex, interval]);

  const goToPrev = () => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 0, duration: 200, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 20, duration: 200, useNativeDriver: true }),
    ]).start(() => {
      setCurrentIndex((prev) => (prev - 1 + prompts.length) % prompts.length);
      slideAnim.setValue(-20);
      Animated.parallel([
        Animated.timing(fadeAnim, { toValue: 1, duration: 200, useNativeDriver: true }),
        Animated.timing(slideAnim, { toValue: 0, duration: 200, useNativeDriver: true }),
      ]).start();
    });
  };

  if (!isVisible) return null;

  const currentPrompt = prompts[currentIndex];

  return (
    <View style={styles.carouselContainer}>
      <TouchableOpacity
        onPress={goToPrev}
        style={styles.carouselArrow}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
      >
        <Ionicons name="chevron-back" size={20} color="#6b7280" />
      </TouchableOpacity>

      <Animated.View
        style={[
          styles.carouselContent,
          {
            opacity: fadeAnim,
            transform: [{ translateY: slideAnim }],
          }
        ]}
      >
        <Text style={styles.carouselEmoji}>{currentPrompt.emoji}</Text>
        <Text style={styles.carouselText}>{currentPrompt.text}</Text>
      </Animated.View>

      <TouchableOpacity
        onPress={goToNext}
        style={styles.carouselArrow}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
      >
        <Ionicons name="chevron-forward" size={20} color="#6b7280" />
      </TouchableOpacity>

    </View>
  );
};

// Componente DailyChallengeCard - Carrossel de 3 desafios
const DailyChallengeCard: React.FC<{ isVisible: boolean; userGoal: string | undefined; completedChallenges: string[] }> = ({ isVisible, userGoal, completedChallenges }) => {
  const borderAnim = useRef(new Animated.Value(0)).current;

  // Use a constant seed based on the current day so challenges don't jump around randomly
  const [dailyChallenges] = useState(() => getDailyChallenges(userGoal));

  const hasRemainingChallenges = dailyChallenges.some(c => !completedChallenges.includes(c.text));

  useEffect(() => {
    if (isVisible && hasRemainingChallenges) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(borderAnim, {
            toValue: 1,
            duration: 1500,
            easing: Easing.linear,
            useNativeDriver: false,
          }),
          Animated.timing(borderAnim, {
            toValue: 0,
            duration: 1500,
            easing: Easing.linear,
            useNativeDriver: false,
          }),
        ])
      ).start();
    } else {
      borderAnim.stopAnimation();
      borderAnim.setValue(0);
    }
  }, [isVisible, hasRemainingChallenges]);

  if (!isVisible) return null;

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.dailyChallengeScroll}
      contentContainerStyle={styles.dailyChallengeScrollContent}
      snapToInterval={SCREEN_WIDTH * 0.85 + 12}
      decelerationRate="fast"
    >
      {dailyChallenges.map((challenge, index) => {
        const isThisCompleted = completedChallenges.includes(challenge.text);

        const borderColor = isThisCompleted ? '#fbbf24' : borderAnim.interpolate({
          inputRange: [0, 0.5, 1],
          outputRange: ['#2d2d3a', '#2d2d3a', '#2d2d3a'],
        });

        return (
          <TouchableOpacity
            key={index}
            activeOpacity={isThisCompleted ? 1 : 0.8}
            onPress={() => {
              if (!isThisCompleted) {
                router.push({ pathname: '/challenge', params: { text: challenge.text, emoji: challenge.emoji } as any });
              }
            }}
          >
            <Animated.View
              style={[
                styles.dailyChallengeWrapper,
                isThisCompleted && styles.dailyChallengeCompleted,
                { borderColor: borderColor },
                { width: SCREEN_WIDTH * 0.85, marginRight: index === 2 ? 0 : 12 }
              ]}
            >
              <View style={styles.dailyChallengeHeader}>
                <Ionicons name="trophy-outline" size={16} color={isThisCompleted ? "#fbbf24" : "#8b5cf6"} />
                <Text style={[styles.dailyChallengeTitle, isThisCompleted && { color: '#fbbf24' }]}>
                  Desafio Diário {index + 1}/3
                </Text>
              </View>
              <View style={styles.dailyChallengeContent}>
                <Text style={styles.dailyChallengeEmoji}>{challenge.emoji}</Text>
                <Text style={styles.dailyChallengeText}>{challenge.text}</Text>
              </View>
              {isThisCompleted && (
                <View style={styles.completedBadge}>
                  <Ionicons name="checkmark-circle" size={12} color="#fbbf24" />
                  <Text style={styles.completedBadgeText}>Concluído</Text>
                </View>
              )}
            </Animated.View>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
};

// Simple emotion analysis based on keywords
const analyzeEmotion = (text: string): { emotion: string; emoji: string; score: number } => {
  const lowerText = text.toLowerCase();

  const emotions = [
    { keywords: ['feliz', 'alegre', 'contente', 'maravilhoso', 'incrível', 'ótimo', 'excelente', 'animado'], emotion: 'feliz', emoji: '😊', score: 8 },
    { keywords: ['triste', 'chateado', 'decepcionado', 'infeliz', 'desanimado', 'mal'], emotion: 'triste', emoji: '😢', score: 3 },
    { keywords: ['amor', 'amo', 'apaixonado', 'carinho', 'querido', 'coração'], emotion: 'apaixonado', emoji: '❤️', score: 9 },
    { keywords: ['raiva', 'irritado', 'bravo', 'nervoso', 'frustrado', 'ódio'], emotion: 'irritado', emoji: '😤', score: 2 },
    { keywords: ['medo', 'assustado', 'preocupado', 'ansioso', 'tenso'], emotion: 'ansioso', emoji: '😰', score: 4 },
    { keywords: ['calmo', 'tranquilo', 'paz', 'sereno', 'relaxado'], emotion: 'calmo', emoji: '😌', score: 7 },
    { keywords: ['grato', 'gratidão', 'agradeço', 'abençoado', 'sortudo'], emotion: 'grato', emoji: '🙏', score: 8 },
    { keywords: ['cansado', 'exausto', 'esgotado', 'sono'], emotion: 'cansado', emoji: '😴', score: 4 },
    { keywords: ['surpreso', 'surpresa', 'chocado', 'inesperado'], emotion: 'surpreso', emoji: '😮', score: 6 },
    { keywords: ['esperança', 'otimista', 'confiante', 'acredito'], emotion: 'esperançoso', emoji: '🌟', score: 7 },
  ];

  for (const e of emotions) {
    if (e.keywords.some(k => lowerText.includes(k))) {
      return { emotion: e.emotion, emoji: e.emoji, score: e.score };
    }
  }

  return { emotion: 'neutro', emoji: '😐', score: 5 };
};

// useFloatingPrompts hook removed

export default function RecordScreen() {
  const { accessToken, user, syncWithDrive, addAvatarXP, completeDailyChallenge } = useAuth();
  const [recordingState, setRecordingState] = useState<RecordingState>('idle');
  const [recording, setRecording] = useState<Audio.Recording | null>(null);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [audioBase64, setAudioBase64] = useState<string | null>(null);
  const [transcription, setTranscription] = useState('');
  const [transcriptionSegments, setTranscriptionSegments] = useState<Array<{ text: string; startTime: number; endTime: number }>>([]);
  const [showTextModal, setShowTextModal] = useState(false);
  const [textMemory, setTextMemory] = useState('');
  const [isSavingText, setIsSavingText] = useState(false);
  const [memoryDate, setMemoryDate] = useState('');
  const [showDateInput, setShowDateInput] = useState(false);
  const [focusInput, setFocusInput] = useState(false);

  const [showEmotionModal, setShowEmotionModal] = useState(false);
  const [savedMemory, setSavedMemory] = useState<LocalMemory | null>(null);
  // Phase 3.2 – NER cross-referencing state
  const [nerMatchedConnections, setNerMatchedConnections] = useState<Array<{ id: string; name: string; relationship: string }>>([]);
  const [nerUnknownNames, setNerUnknownNames] = useState<string[]>([]); // names NOT in constellation

  const pulseAnim = useRef(new Animated.Value(1)).current;
  // Animações de waveform para feedback visual de captação
  const waveAnim1 = useRef(new Animated.Value(1)).current;
  const waveAnim2 = useRef(new Animated.Value(1)).current;
  const waveAnim3 = useRef(new Animated.Value(1)).current;

  // Animações dos Anéis de Energia (Botão Gravar)
  const ringAnim1 = useRef(new Animated.Value(0)).current;
  const ringAnim2 = useRef(new Animated.Value(0)).current;
  const ringAnim3 = useRef(new Animated.Value(0)).current;

  const glowAnim = useRef(new Animated.Value(0)).current;
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const isChallengeCompletedToday = user?.lastChallengeCompletedAt ? isToday(new Date(user.lastChallengeCompletedAt)) : false;

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  useEffect(() => {
    const createLoop = (anim: Animated.Value, duration: number, isClockwise: boolean) => {
      anim.setValue(0);
      Animated.loop(
        Animated.timing(anim, {
          toValue: isClockwise ? 1 : -1,
          duration,
          easing: Easing.linear,
          useNativeDriver: true,
        })
      ).start();
    };

    if (recordingState === 'idle') {
      createLoop(ringAnim1, 8000, true);
      createLoop(ringAnim2, 12000, false);
      createLoop(ringAnim3, 15000, true);
    } else {
      ringAnim1.stopAnimation();
      ringAnim2.stopAnimation();
      ringAnim3.stopAnimation();
    }
  }, [recordingState]);

  const spin1 = ringAnim1.interpolate({ inputRange: [-1, 1], outputRange: ['-360deg', '360deg'] });
  const spin2 = ringAnim2.interpolate({ inputRange: [-1, 1], outputRange: ['-360deg', '360deg'] });
  const spin3 = ringAnim3.interpolate({ inputRange: [-1, 1], outputRange: ['-360deg', '360deg'] });

  useEffect(() => {
    if (recordingState === 'recording') {
      // Animação principal do botão
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.15,
            duration: 600,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 600,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
        ])
      ).start();

      // Animação de glow
      Animated.loop(
        Animated.sequence([
          Animated.timing(glowAnim, {
            toValue: 1,
            duration: 800,
            useNativeDriver: true,
          }),
          Animated.timing(glowAnim, {
            toValue: 0.3,
            duration: 800,
            useNativeDriver: true,
          }),
        ])
      ).start();

      // Animações de ondas de som (waveform) - defasadas
      const createWaveAnimation = (anim: Animated.Value, delay: number) => {
        setTimeout(() => {
          Animated.loop(
            Animated.sequence([
              Animated.timing(anim, {
                toValue: 1.6,
                duration: 400,
                easing: Easing.out(Easing.ease),
                useNativeDriver: true,
              }),
              Animated.timing(anim, {
                toValue: 0.8,
                duration: 400,
                easing: Easing.in(Easing.ease),
                useNativeDriver: true,
              }),
            ])
          ).start();
        }, delay);
      };

      createWaveAnimation(waveAnim1, 0);
      createWaveAnimation(waveAnim2, 150);
      createWaveAnimation(waveAnim3, 300);

    } else {
      pulseAnim.stopAnimation();
      pulseAnim.setValue(1);
      glowAnim.stopAnimation();
      glowAnim.setValue(0);
      waveAnim1.stopAnimation();
      waveAnim1.setValue(1);
      waveAnim2.stopAnimation();
      waveAnim2.setValue(1);
      waveAnim3.stopAnimation();
      waveAnim3.setValue(1);
    }
  }, [recordingState]);

  const startRecording = async () => {
    try {
      // Feedback tátil ao iniciar gravação
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

      if (recording) {
        try { await recording.stopAndUnloadAsync(); } catch (e) { }
        setRecording(null);
      }

      const audioPermission = await Audio.requestPermissionsAsync();
      if (!audioPermission.granted) {
        Alert.alert('Permissão necessária', 'Precisamos de permissão para gravar áudio.');
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
      setRecordingDuration(0);
      setTranscription('');
      setAudioBase64(null);

      timerRef.current = setInterval(() => {
        setRecordingDuration((prev) => prev + 1);
      }, 1000);
    } catch (error) {
      console.error('Failed to start recording:', error);
      Alert.alert('Erro', 'Não foi possível iniciar a gravação.');
      setRecordingState('idle');
    }
  };

  const pauseRecording = async () => {
    if (!recording || recordingState !== 'recording') return;
    try {
      await recording.pauseAsync();
      setRecordingState('paused');
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    } catch (error) {
      console.error('Failed to pause recording:', error);
    }
  };

  const resumeRecording = async () => {
    if (!recording || recordingState !== 'paused') return;
    try {
      await recording.startAsync();
      setRecordingState('recording');
      timerRef.current = setInterval(() => {
        setRecordingDuration((prev) => prev + 1);
      }, 1000);
    } catch (error) {
      console.error('Failed to resume recording:', error);
    }
  };

  const stopRecording = async () => {
    if (!recording) return;

    try {
      // Feedback tátil ao parar gravação
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }

      await recording.stopAndUnloadAsync();
      const uri = recording.getURI();
      setRecording(null);

      if (uri) {
        // Convert to base64
        const response = await fetch(uri);
        const blob = await response.blob();
        const base64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onloadend = () => {
            const result = reader.result as string;
            resolve(result.split(',')[1]);
          };
          reader.onerror = reject;
          reader.readAsDataURL(blob);
        });
        setAudioBase64(base64);

        // Set initial state and try to transcribe
        setTranscription('Transcrevendo...');
        setRecordingState('preview');

        // Try to transcribe automatically using public endpoint
        try {
          const backendUrl = process.env.EXPO_PUBLIC_BACKEND_URL || '';
          const transcribeResponse = await fetch(`${backendUrl}/api/transcribe`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              audio_base64: base64,
              duration_seconds: recordingDuration
            }),
          });

          if (transcribeResponse.ok) {
            const data = await transcribeResponse.json();
            if (data.transcription && data.transcription.trim()) {
              setTranscription(data.transcription);
              // Save segments for later use when saving memory
              if (data.segments && data.segments.length > 0) {
                setTranscriptionSegments(data.segments.map((s: any) => ({
                  text: s.text,
                  startTime: s.start_time,
                  endTime: s.end_time,
                })));
              }
            } else {
              setTranscription('');
              setTranscriptionSegments([]);
            }
          } else {
            setTranscription('');
            setTranscriptionSegments([]);
            console.log('Transcription failed with status:', transcribeResponse.status);
          }
        } catch (transcribeError) {
          console.log('Transcription error:', transcribeError);
          setTranscription('');
        }
      }
    } catch (error) {
      console.error('Failed to stop recording:', error);
      Alert.alert('Erro', 'Não foi possível processar a gravação.');
      setRecordingState('idle');
    }
  };

  const cancelRecording = async () => {
    if (recording) {
      try {
        if (timerRef.current) {
          clearInterval(timerRef.current);
          timerRef.current = null;
        }
        await recording.stopAndUnloadAsync();
      } catch (e) { }
    }
    setRecording(null);
    setRecordingState('idle');
    setRecordingDuration(0);
    setAudioBase64(null);
    setTranscription('');
  };

  const saveMemory = async () => {
    if (!transcription.trim()) {
      Alert.alert('Texto vazio', 'Por favor, escreva ou edite o texto antes de salvar.');
      return;
    }

    try {
      setRecordingState('saving');

      // Get all current connections to pass to AI for tagging
      const allConnections = await localStorage.getConnections();

      // Try to analyze emotion with AI API
      let emotionResult = {
        emotion: 'neutro',
        emoji: '😐',
        score: 5,
        emotions: [] as Array<{ emotion: string; emoji: string; intensity: number }>,
        summary: '',
        mentionedConnections: [] as string[]
      };

      try {
        const backendUrl = process.env.EXPO_PUBLIC_BACKEND_URL || '';
        const response = await fetch(`${backendUrl}/api/analyze-emotion`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            text: transcription.trim(),
            connections: allConnections.map(c => ({ id: c.id, name: c.name, relationship: c.relationship }))
          }),
        });

        if (response.ok) {
          const data = await response.json();
          emotionResult = {
            emotion: data.emotion || 'neutro',
            emoji: data.emotion_emoji || '😐',
            score: data.mood_score || 5,
            emotions: data.emotions || [],
            summary: data.summary || '',
            mentionedConnections: data.mentioned_connections || [],
          };
          // Phase 3.2: populate NER modal state
          const detectedNames: string[] = data.detected_names || [];
          const matchedIds: string[] = data.mentioned_connections || [];
          const matchedConns = allConnections.filter(c => matchedIds.includes(c.id));
          const matchedNamesLower = matchedConns.map(c => c.name.toLowerCase());
          const unknownNames = detectedNames.filter(
            n => !matchedNamesLower.some(mn => mn.includes(n.toLowerCase()) || n.toLowerCase().includes(mn))
          );
          setNerMatchedConnections(matchedConns.map(c => ({ id: c.id, name: c.name, relationship: c.relationship })));
          setNerUnknownNames(unknownNames.slice(0, 3));
        } else {
          const localResult = analyzeEmotion(transcription);
          // Local fallback tagging (simple text match)
          const matchedIds = allConnections
            .filter(c => transcription.toLowerCase().includes(c.name.toLowerCase()))
            .map(c => c.id);
          // Also show NER cards for local matches
          const localMatched = allConnections.filter(c => transcription.toLowerCase().includes(c.name.toLowerCase()));
          setNerMatchedConnections(localMatched.map(c => ({ id: c.id, name: c.name, relationship: c.relationship })));
          setNerUnknownNames([]);
          emotionResult = { ...emotionResult, emotion: localResult.emotion, emoji: localResult.emoji, score: localResult.score, mentionedConnections: matchedIds };
        }
      } catch (apiError) {
        console.log('API emotion analysis failed, using local:', apiError);
        const localResult = analyzeEmotion(transcription);
        const matchedConns = allConnections.filter(c => transcription.toLowerCase().includes(c.name.toLowerCase()));
        const matchedIds = matchedConns.map(c => c.id);
        setNerMatchedConnections(matchedConns.map(c => ({ id: c.id, name: c.name, relationship: c.relationship })));
        setNerUnknownNames([]);
        emotionResult = { ...emotionResult, emotion: localResult.emotion, emoji: localResult.emoji, score: localResult.score, mentionedConnections: matchedIds };
      }

      // Create memory object
      const now = new Date().toISOString();
      const memory: LocalMemory = {
        id: uuidv4(),
        userId: user?.id || 'unknown',
        transcription: transcription.trim(),
        emotion: emotionResult.emotion,
        emotionEmoji: emotionResult.emoji,
        moodScore: emotionResult.score,
        audioBase64: user?.storagePreference === 'text_only' ? undefined : (audioBase64 || undefined),
        durationSeconds: recordingDuration || undefined,
        segments: transcriptionSegments.length > 0 ? transcriptionSegments : undefined,
        emotions: emotionResult.emotions,
        summary: emotionResult.summary,
        mentionedConnections: emotionResult.mentionedConnections,
        createdAt: now,
        updatedAt: now,
        synced: false,
      };

      // Save locally
      await localStorage.saveMemory(memory);

      // Desafio diário visual checklist será validado via IA no botão correto
      // if (!isChallengeCompletedToday && completeDailyChallenge) {
      //   completeDailyChallenge();
      // }

      // Earn Avatar gamification points
      if (addAvatarXP) {
        await addAvatarXP(10);
      }

      // Try to sync with Google Drive in background
      syncWithDrive().catch(err => console.log('Background sync failed:', err));

      setRecordingState('idle');
      setRecordingDuration(0);
      setAudioBase64(null);
      setTranscription('');
      setTranscriptionSegments([]);

      setSavedMemory(memory);
      setShowEmotionModal(true);
    } catch (error) {
      console.error('Failed to save memory:', error);
      Alert.alert('Erro', 'Não foi possível salvar. Tente novamente.');
      setRecordingState('preview');
    }
  };

  const saveTextMemory = async () => {
    if (!textMemory.trim()) {
      Alert.alert('Texto vazio', 'Por favor, escreva algo antes de salvar.');
      return;
    }

    try {
      setIsSavingText(true);

      // Get all current connections to pass to AI for tagging
      const allConnections = await localStorage.getConnections();

      // Try to analyze emotion with AI API
      let emotionResult = {
        emotion: 'neutro',
        emoji: '😐',
        score: 5,
        emotions: [] as Array<{ emotion: string; emoji: string; intensity: number }>,
        summary: '',
        mentionedConnections: [] as string[]
      };

      try {
        const backendUrl = process.env.EXPO_PUBLIC_BACKEND_URL || '';
        const response = await fetch(`${backendUrl}/api/analyze-emotion`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            text: textMemory.trim(),
            connections: allConnections.map(c => ({ id: c.id, name: c.name, relationship: c.relationship }))
          }),
        });

        if (response.ok) {
          const data = await response.json();
          emotionResult = {
            emotion: data.emotion || 'neutro',
            emoji: data.emotion_emoji || '😐',
            score: data.mood_score || 5,
            emotions: data.emotions || [],
            summary: data.summary || '',
            mentionedConnections: data.mentioned_connections || [],
          };
          // Phase 3.2: populate NER modal state
          const detectedNames2: string[] = data.detected_names || [];
          const matchedIds2: string[] = data.mentioned_connections || [];
          const matchedConns2 = allConnections.filter(c => matchedIds2.includes(c.id));
          const matchedNamesLower2 = matchedConns2.map(c => c.name.toLowerCase());
          const unknownNames2 = detectedNames2.filter(
            n => !matchedNamesLower2.some(mn => mn.includes(n.toLowerCase()) || n.toLowerCase().includes(mn))
          );
          setNerMatchedConnections(matchedConns2.map(c => ({ id: c.id, name: c.name, relationship: c.relationship })));
          setNerUnknownNames(unknownNames2.slice(0, 3));
        } else {
          // Fallback to local analysis
          const localResult = analyzeEmotion(textMemory);
          const localMatched2 = allConnections.filter(c => textMemory.toLowerCase().includes(c.name.toLowerCase()));
          const matchedIds = localMatched2.map(c => c.id);
          setNerMatchedConnections(localMatched2.map(c => ({ id: c.id, name: c.name, relationship: c.relationship })));
          setNerUnknownNames([]);
          emotionResult = { ...emotionResult, emotion: localResult.emotion, emoji: localResult.emoji, score: localResult.score, mentionedConnections: matchedIds };
        }
      } catch (apiError) {
        console.log('API emotion analysis failed, using local:', apiError);
        const localResult = analyzeEmotion(textMemory);
        const matchedConns3 = allConnections.filter(c => textMemory.toLowerCase().includes(c.name.toLowerCase()));
        const matchedIds = matchedConns3.map(c => c.id);
        setNerMatchedConnections(matchedConns3.map(c => ({ id: c.id, name: c.name, relationship: c.relationship })));
        setNerUnknownNames([]);
        emotionResult = { ...emotionResult, emotion: localResult.emotion, emoji: localResult.emoji, score: localResult.score, mentionedConnections: matchedIds };
      }

      // Create memory object
      const now = new Date().toISOString();
      const memory: LocalMemory = {
        id: uuidv4(),
        userId: user?.id || 'unknown',
        transcription: textMemory.trim(),
        emotion: emotionResult.emotion,
        emotionEmoji: emotionResult.emoji,
        moodScore: emotionResult.score,
        memoryDate: memoryDate || undefined,
        emotions: emotionResult.emotions,
        summary: emotionResult.summary,
        mentionedConnections: emotionResult.mentionedConnections,
        createdAt: now,
        updatedAt: now,
        synced: false,
      };

      // Save locally
      await localStorage.saveMemory(memory);

      // Desafio diário visual checklist será validado via IA no botão correto
      // if (!isChallengeCompletedToday && completeDailyChallenge) {
      //   completeDailyChallenge();
      // }

      // Earn Avatar gamification points
      if (addAvatarXP) {
        await addAvatarXP(10);
      }

      // Try to sync with Google Drive in background
      syncWithDrive().catch(err => console.log('Background sync failed:', err));

      setShowTextModal(false);
      setTextMemory('');
      setMemoryDate('');
      setShowDateInput(false);

      setSavedMemory(memory);
      setShowEmotionModal(true);
    } catch (error) {
      console.error('Failed to save text memory:', error);
      Alert.alert('Erro', 'Não foi possível salvar. Tente novamente.');
    } finally {
      setIsSavingText(false);
    }
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Bom dia';
    if (hour < 18) return 'Boa tarde';
    return 'Boa noite';
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <KeyboardAvoidingView
        style={styles.keyboardView}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerRow}>
              <View style={styles.headerLeft}>
                <Text style={styles.greeting}>{getGreeting()}, {user?.name?.split(' ')[0]}!</Text>
                <Text style={styles.prompt}>
                  {recordingState === 'idle' && 'O que você quer guardar hoje?'}
                  {recordingState === 'recording' && 'Estou ouvindo você...'}
                  {recordingState === 'paused' && 'Gravação pausada'}
                  {recordingState === 'preview' && 'Revise e edite o texto'}
                  {recordingState === 'saving' && 'Salvando memória...'}
                </Text>
              </View>
            </View>
          </View>

          {/* Main Content Area */}
          <View style={styles.mainArea}>
            {/* TRANSCRIBING / SAVING STATE - Mágica da IA */}
            {(recordingState === 'transcribing' || recordingState === 'saving') && (
              <AILoadingAnimation
                message={recordingState === 'transcribing' ? 'Transcrevendo áudio...' : 'Analisando emoções...'}
              />
            )}

            {/* IDLE STATE */}
            {recordingState === 'idle' && (
              <View style={styles.idleContainer}>
                {/* Desafio Diário Destacado */}
                <DailyChallengeCard
                  isVisible={recordingState === 'idle'}
                  userGoal={user?.userGoal}
                  completedChallenges={user?.completedDailyChallenges || []}
                />

                {/* Carrossel de sugestões simplificado */}
                <PromptCarousel isVisible={recordingState === 'idle'} interval={7000} />

                {/* Botão de Microfone Elevado com Anéis de Energia Animados */}
                <View style={styles.mainRecordButtonContainer}>
                  {/* Rotating Rings */}
                  <Animated.View style={[styles.energyRing, styles.ring1, { transform: [{ rotate: spin1 }] }]} pointerEvents="none" />
                  <Animated.View style={[styles.energyRing, styles.ring2, { transform: [{ rotate: spin2 }] }]} pointerEvents="none" />
                  <Animated.View style={[styles.energyRing, styles.ring3, { transform: [{ rotate: spin3 }] }]} pointerEvents="none" />

                  <TouchableOpacity
                    style={styles.mainRecordButton}
                    onPress={startRecording}
                    activeOpacity={0.7}
                  >
                    <View style={styles.mainRecordButtonOuter}>
                      <View style={styles.mainRecordButtonInner}>
                        <Ionicons name="mic" size={64} color="#fff" />
                      </View>
                    </View>
                  </TouchableOpacity>
                </View>
                <Text style={styles.instruction}>Toque para gravar sua memória</Text>

                <TouchableOpacity
                  style={styles.textButton}
                  onPress={() => setShowTextModal(true)}
                >
                  <Ionicons name="create-outline" size={20} color="#8b5cf6" />
                  <Text style={styles.textButtonLabel}>Ou escreva um texto</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* RECORDING / PAUSED STATE */}
            {(recordingState === 'recording' || recordingState === 'paused') && (
              <View style={styles.recordingContainer}>
                <View style={styles.durationContainer}>
                  <View style={[
                    styles.recordingIndicator,
                    recordingState === 'paused' && styles.recordingIndicatorPaused
                  ]} />
                  <Text style={styles.durationText}>{formatDuration(recordingDuration)}</Text>
                </View>

                {recordingState === 'recording' ? (
                  <View style={styles.recordingVisualContainer}>
                    {/* Waveform Animation - Barras de som animadas */}
                    <View style={styles.waveformContainer}>
                      <Animated.View
                        style={[
                          styles.waveBar,
                          styles.waveBarLeft,
                          { transform: [{ scaleY: waveAnim1 }] }
                        ]}
                      />
                      <Animated.View
                        style={[
                          styles.waveBar,
                          styles.waveBarMiddle,
                          { transform: [{ scaleY: waveAnim2 }] }
                        ]}
                      />
                      <Animated.View
                        style={[
                          styles.waveBar,
                          styles.waveBarRight,
                          { transform: [{ scaleY: waveAnim3 }] }
                        ]}
                      />
                    </View>

                    {/* Botão de microfone pulsando */}
                    <Animated.View style={[
                      styles.pulsingCircle,
                      {
                        transform: [{ scale: pulseAnim }],
                        opacity: glowAnim.interpolate({
                          inputRange: [0, 1],
                          outputRange: [0.8, 1]
                        })
                      }
                    ]}>
                      <View style={styles.recordingGlow} />
                      <View style={styles.recordingCircleInner}>
                        <Ionicons name="mic" size={48} color="#fff" />
                      </View>
                    </Animated.View>

                    {/* Waveform direita */}
                    <View style={styles.waveformContainer}>
                      <Animated.View
                        style={[
                          styles.waveBar,
                          styles.waveBarLeft,
                          { transform: [{ scaleY: waveAnim3 }] }
                        ]}
                      />
                      <Animated.View
                        style={[
                          styles.waveBar,
                          styles.waveBarMiddle,
                          { transform: [{ scaleY: waveAnim1 }] }
                        ]}
                      />
                      <Animated.View
                        style={[
                          styles.waveBar,
                          styles.waveBarRight,
                          { transform: [{ scaleY: waveAnim2 }] }
                        ]}
                      />
                    </View>
                  </View>
                ) : (
                  <View style={styles.pausedCircle}>
                    <Ionicons name="pause" size={48} color="#fff" />
                  </View>
                )}

                <Text style={styles.listeningText}>
                  {recordingState === 'recording' ? '🎙️ Estou ouvindo você...' : '⏸️ Gravação pausada'}
                </Text>

                <View style={styles.controlsRow}>
                  <TouchableOpacity style={styles.controlBtn} onPress={cancelRecording}>
                    <View style={[styles.controlBtnInner, styles.cancelBtn]}>
                      <Ionicons name="trash-outline" size={24} color="#fff" />
                    </View>
                    <Text style={styles.controlLabel}>Descartar</Text>
                  </TouchableOpacity>

                  {recordingState === 'recording' ? (
                    <TouchableOpacity style={styles.controlBtn} onPress={pauseRecording}>
                      <View style={[styles.controlBtnInner, styles.pauseBtn]}>
                        <Ionicons name="pause" size={24} color="#fff" />
                      </View>
                      <Text style={styles.controlLabel}>Pausar</Text>
                    </TouchableOpacity>
                  ) : (
                    <TouchableOpacity style={styles.controlBtn} onPress={resumeRecording}>
                      <View style={[styles.controlBtnInner, styles.resumeBtn]}>
                        <Ionicons name="play" size={24} color="#fff" />
                      </View>
                      <Text style={styles.controlLabel}>Continuar</Text>
                    </TouchableOpacity>
                  )}

                  <TouchableOpacity style={styles.controlBtn} onPress={stopRecording}>
                    <View style={[styles.controlBtnInner, styles.nextBtn]}>
                      <Ionicons name="arrow-forward" size={24} color="#fff" />
                    </View>
                    <Text style={styles.controlLabel}>Próximo</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {/* PREVIEW STATE - Edit transcription */}
            {recordingState === 'preview' && (
              <View style={styles.previewContainer}>
                <View style={styles.previewHeader}>
                  <Ionicons name="document-text-outline" size={20} color="#8b5cf6" />
                  <Text style={styles.previewTitle}>Edite o texto se necessário</Text>
                </View>

                <TextInput
                  style={styles.transcriptionInput}
                  value={transcription}
                  onChangeText={setTranscription}
                  multiline
                  placeholder="Digite ou edite o texto aqui..."
                  placeholderTextColor="#6b7280"
                  textAlignVertical="top"
                />

                <View style={styles.previewActions}>
                  <TouchableOpacity style={styles.discardBtn} onPress={cancelRecording}>
                    <Ionicons name="trash-outline" size={20} color="#ef4444" />
                    <Text style={styles.discardBtnText}>Descartar</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.saveBtn, !transcription.trim() && styles.saveBtnDisabled]}
                    onPress={saveMemory}
                    disabled={!transcription.trim()}
                  >
                    <Ionicons name="checkmark" size={20} color="#fff" />
                    <Text style={styles.saveBtnText}>Salvar</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </View>

          {/* Manage Memories Button - only when idle */}
          {recordingState === 'idle' && (
            <View style={styles.manageMemoriesContainer}>
              <TouchableOpacity
                style={styles.manageMemoriesButton}
                // @ts-ignore
                onPress={() => router.push('/memories_history')}
                activeOpacity={0.8}
              >
                <View style={styles.manageMemoriesIconContainer}>
                  <Ionicons name="library" size={24} color="#fff" />
                </View>
                <View style={styles.manageMemoriesTextContainer}>
                  <Text style={styles.manageMemoriesTitle}>Gerenciar Memórias</Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color="#6b7280" />
              </TouchableOpacity>
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Text Memory Modal */}
      <Modal
        visible={showTextModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowTextModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Escrever memória</Text>
              <TouchableOpacity onPress={() => {
                setShowTextModal(false);
                setTextMemory('');
                setMemoryDate('');
                setShowDateInput(false);
              }}>
                <Ionicons name="close" size={24} color="#9ca3af" />
              </TouchableOpacity>
            </View>

            <TextInput
              style={styles.modalTextInput}
              value={textMemory}
              onChangeText={setTextMemory}
              multiline
              placeholder="Escreva o que você quer guardar..."
              placeholderTextColor="#6b7280"
              textAlignVertical="top"
              autoFocus
            />

            {/* Date Option */}
            <TouchableOpacity
              style={styles.dateOptionBtn}
              onPress={() => setShowDateInput(!showDateInput)}
            >
              <Ionicons
                name={showDateInput ? "calendar" : "calendar-outline"}
                size={18}
                color={memoryDate ? "#8b5cf6" : "#6b7280"}
              />
              <Text style={[styles.dateOptionText, memoryDate && styles.dateOptionTextActive]}>
                {memoryDate ? `Quando aconteceu: ${memoryDate}` : "Quando isso aconteceu? (opcional)"}
              </Text>
              <Ionicons
                name={showDateInput ? "chevron-up" : "chevron-down"}
                size={16}
                color="#6b7280"
              />
            </TouchableOpacity>

            {showDateInput && (
              <View style={styles.dateInputContainer}>
                <TextInput
                  style={styles.dateInput}
                  value={memoryDate}
                  onChangeText={setMemoryDate}
                  placeholder="DD/MM/AAAA ou descreva (ex: semana passada)"
                  placeholderTextColor="#6b7280"
                />
                {memoryDate ? (
                  <TouchableOpacity onPress={() => setMemoryDate('')}>
                    <Ionicons name="close-circle" size={20} color="#6b7280" />
                  </TouchableOpacity>
                ) : null}
              </View>
            )}

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.modalCancelBtn}
                onPress={() => {
                  setShowTextModal(false);
                  setTextMemory('');
                  setMemoryDate('');
                  setShowDateInput(false);
                }}
              >
                <Text style={styles.modalCancelText}>Cancelar</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.modalSaveBtn, (!textMemory.trim() || isSavingText) && styles.modalSaveBtnDisabled]}
                onPress={saveTextMemory}
                disabled={!textMemory.trim() || isSavingText}
              >
                {isSavingText ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <>
                    <Ionicons name="checkmark" size={20} color="#fff" />
                    <Text style={styles.modalSaveText}>Salvar</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Emotion Confirmation Modal */}
      {showEmotionModal && savedMemory && (
        <Modal
          visible={showEmotionModal}
          animationType="fade"
          transparent={true}
          onRequestClose={() => {
            setShowEmotionModal(false);
            setSavedMemory(null);
          }}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.emotionModalContent}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>✨ Memória salva!</Text>
                <TouchableOpacity onPress={() => {
                  setShowEmotionModal(false);
                  setSavedMemory(null);
                }}>
                  <Ionicons name="close" size={24} color="#9ca3af" />
                </TouchableOpacity>
              </View>

              <Text style={styles.emotionModalSubtitle}>
                A IA detectou a seguinte emoção principal:
              </Text>

              <View style={styles.currentEmotionBadge}>
                <Text style={styles.currentEmotionEmoji}>{savedMemory.emotionEmoji}</Text>
                <Text style={styles.currentEmotionText}>{savedMemory.emotion}</Text>
              </View>

              {savedMemory.summary && (
                <View style={{
                  marginTop: 12,
                  padding: 12,
                  backgroundColor: savedMemory.summary.includes('[ALERTA_SENSIVEL]') ? 'rgba(239, 68, 68, 0.1)' : 'rgba(139, 92, 246, 0.1)',
                  borderRadius: 12,
                  borderWidth: 1,
                  borderColor: savedMemory.summary.includes('[ALERTA_SENSIVEL]') ? 'rgba(239, 68, 68, 0.3)' : 'rgba(139, 92, 246, 0.2)'
                }}>
                  {savedMemory.summary.includes('[ALERTA_SENSIVEL]') && (
                    <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8, gap: 6 }}>
                      <Ionicons name="warning" size={16} color="#ef4444" />
                      <Text style={{ color: '#ef4444', fontWeight: 'bold', fontSize: 13 }}>Aviso de Segurança</Text>
                    </View>
                  )}
                  <Text style={{ color: '#e5e7eb', fontSize: 14, lineHeight: 20, fontStyle: 'italic' }}>
                    {savedMemory.summary.replace('[ALERTA_SENSIVEL]', '').trim()}
                  </Text>
                </View>
              )}

              {savedMemory.emotions && savedMemory.emotions.length > 1 && (
                <View style={styles.emotionSuggestionsContainer}>
                  <Text style={styles.emotionSuggestionsTitle}>Você prefere alguma destas como principal?</Text>
                  <View style={styles.emotionOptions}>
                    {savedMemory.emotions.slice(0, 3).map((em, idx) => (
                      <TouchableOpacity
                        key={idx}
                        style={[styles.emotionOptionBtn, savedMemory.emotion === em.emotion && styles.emotionOptionActive]}
                        onPress={async () => {
                          const updated = { ...savedMemory, emotion: em.emotion, emotionEmoji: em.emoji };
                          await localStorage.saveMemory(updated);
                          setSavedMemory(updated);
                          syncWithDrive().catch(e => console.log(e));
                        }}
                      >
                        <Text style={styles.emotionOptionEmoji}>{em.emoji}</Text>
                        <View>
                          <Text style={[styles.emotionOptionText, savedMemory.emotion === em.emotion && styles.emotionOptionTextActive]}>
                            {em.emotion}
                          </Text>
                          <Text style={styles.emotionIntensity}>{em.intensity}% intenso</Text>
                        </View>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              )}

              {/* Phase 3.2: NER Cross-referencing – Matched connections (link prompt) */}
              {nerMatchedConnections.length > 0 && (
                <View style={styles.nerSection}>
                  {nerMatchedConnections.map(conn => (
                    <View key={conn.id} style={styles.nerCard}>
                      <View style={styles.nerCardIcon}>
                        <Ionicons name="people" size={18} color="#8b5cf6" />
                      </View>
                      <Text style={styles.nerCardText}>
                        Você mencionou <Text style={styles.nerHighlight}>{conn.name}</Text>. Deseja vincular esta memória à constelação dessa pessoa?
                      </Text>
                      <View style={styles.nerCardActions}>
                        <TouchableOpacity
                          style={[styles.nerBtn, styles.nerBtnYes]}
                          onPress={async () => {
                            if (savedMemory) {
                              const updated = {
                                ...savedMemory,
                                mentionedConnections: [...(savedMemory.mentionedConnections || []), conn.id].filter((v, i, a) => a.indexOf(v) === i),
                              };
                              await localStorage.saveMemory(updated);
                              setSavedMemory(updated);
                            }
                            setNerMatchedConnections(prev => prev.filter(c => c.id !== conn.id));
                          }}
                        >
                          <Text style={styles.nerBtnText}>Sim</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[styles.nerBtn, styles.nerBtnNo]}
                          onPress={() => setNerMatchedConnections(prev => prev.filter(c => c.id !== conn.id))}
                        >
                          <Text style={[styles.nerBtnText, { color: '#9ca3af' }]}>Não</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  ))}
                </View>
              )}

              {/* Phase 3.2: NER Cross-referencing – Unknown names (create connection prompt) */}
              {nerUnknownNames.length > 0 && (
                <View style={styles.nerSection}>
                  {nerUnknownNames.map(name => (
                    <View key={name} style={[styles.nerCard, styles.nerCardNew]}>
                      <View style={[styles.nerCardIcon, { backgroundColor: 'rgba(16, 185, 129, 0.15)' }]}>
                        <Ionicons name="person-add-outline" size={18} color="#10b981" />
                      </View>
                      <Text style={styles.nerCardText}>
                        Você mencionou <Text style={[styles.nerHighlight, { color: '#10b981' }]}>{name}</Text>. Deseja criar uma nova conexão na sua constelação para essa pessoa?
                      </Text>
                      <View style={styles.nerCardActions}>
                        <TouchableOpacity
                          style={[styles.nerBtn, { backgroundColor: 'rgba(16, 185, 129, 0.2)', borderColor: 'rgba(16, 185, 129, 0.5)' }]}
                          onPress={() => {
                            setNerUnknownNames(prev => prev.filter(n => n !== name));
                            setShowEmotionModal(false);
                            setSavedMemory(null);
                            // Navigate to connections tab with a pre-filled name hint
                            // @ts-ignore
                            router.push({ pathname: '/(tabs)/connections', params: { prefillName: name } as any });
                          }}
                        >
                          <Text style={[styles.nerBtnText, { color: '#10b981' }]}>Criar</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[styles.nerBtn, styles.nerBtnNo]}
                          onPress={() => setNerUnknownNames(prev => prev.filter(n => n !== name))}
                        >
                          <Text style={[styles.nerBtnText, { color: '#9ca3af' }]}>Ignorar</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  ))}
                </View>
              )}

              <View style={styles.modalActions}>
                <TouchableOpacity
                  style={[styles.emotionContinueBtn, { flex: 1, backgroundColor: '#374151', marginRight: 8 }]}
                  onPress={() => {
                    setShowEmotionModal(false);
                    setSavedMemory(null);
                    setNerMatchedConnections([]);
                    setNerUnknownNames([]);
                  }}
                >
                  <Text style={styles.emotionContinueText}>Continuar</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.emotionContinueBtn, { flex: 1 }]}
                  onPress={() => {
                    setShowEmotionModal(false);
                    setSavedMemory(null);
                    setNerMatchedConnections([]);
                    setNerUnknownNames([]);
                    // @ts-ignore
                    router.push('/memories_history');
                  }}
                >
                  <Text style={styles.emotionContinueText}>Ver memórias</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      )}

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  // ── Phase 3.2 NER cards ──
  nerSection: { marginTop: 12, gap: 10 },
  nerCard: {
    backgroundColor: 'rgba(139, 92, 246, 0.08)',
    borderWidth: 1, borderColor: 'rgba(139, 92, 246, 0.25)',
    borderRadius: 14, padding: 14, gap: 10,
  },
  nerCardNew: {
    backgroundColor: 'rgba(16, 185, 129, 0.06)',
    borderColor: 'rgba(16, 185, 129, 0.25)',
  },
  nerCardIcon: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: 'rgba(139, 92, 246, 0.15)',
    alignItems: 'center', justifyContent: 'center', alignSelf: 'flex-start',
  },
  nerCardText: { color: '#d1d5db', fontSize: 13, lineHeight: 19 },
  nerHighlight: { color: '#a78bfa', fontWeight: '700' },
  nerCardActions: { flexDirection: 'row', gap: 10 },
  nerBtn: {
    flex: 1, paddingVertical: 9, alignItems: 'center', borderRadius: 10,
    borderWidth: 1, borderColor: 'rgba(139, 92, 246, 0.4)',
  },
  nerBtnYes: { backgroundColor: 'rgba(139, 92, 246, 0.2)' },
  nerBtnNo: { backgroundColor: 'rgba(55, 65, 81, 0.4)', borderColor: 'rgba(75, 85, 99, 0.4)' },
  nerBtnText: { color: '#a78bfa', fontWeight: '600', fontSize: 13 },

  container: {
    flex: 1,
    backgroundColor: '#0a0a0f',
  },
  keyboardView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 0,
  },
  header: {
    paddingHorizontal: 24,
    paddingTop: 20,
    paddingBottom: 16,
  },
  greeting: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 8,
  },
  prompt: {
    fontSize: 18,
    color: '#9ca3af',
  },
  mainArea: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: 350,
  },
  processingContainer: {
    alignItems: 'center',
  },
  processingText: {
    marginTop: 20,
    fontSize: 18,
    color: '#fff',
  },
  idleContainer: {
    alignItems: 'center',
    width: '100%',
    paddingTop: 10,
    position: 'relative',
  },
  dailyChallengeScroll: {
    width: '100%',
    marginBottom: 16,
  },
  dailyChallengeScrollContent: {
    paddingHorizontal: 24,
  },
  dailyChallengeWrapper: {
    width: '100%',
    backgroundColor: '#1f1035', // Um tom levemente diferente para destacar
    borderRadius: 16,
    paddingHorizontal: 20,
    paddingVertical: 14,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#8b5cf6',
    position: 'relative',
    overflow: 'hidden',
  },
  dailyChallengeCompleted: {
    backgroundColor: '#2a1a0f',
    borderColor: '#fbbf24',
  },
  dailyChallengeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
  },
  dailyChallengeTitle: {
    fontSize: 14,
    color: '#8b5cf6',
    fontWeight: 'bold',
    textTransform: 'uppercase',
  },
  dailyChallengeContent: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  dailyChallengeEmoji: {
    fontSize: 24,
  },
  dailyChallengeText: {
    fontSize: 15,
    color: '#e5e7eb',
    lineHeight: 22,
    flex: 1,
    fontStyle: 'italic',
  },
  completedBadge: {
    position: 'absolute',
    top: 10,
    right: 14,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(251, 191, 36, 0.15)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 4,
  },
  completedBadgeText: {
    fontSize: 10,
    color: '#fbbf24',
    fontWeight: 'bold',
    textTransform: 'uppercase',
  },
  carouselContainer: {
    height: 70, // Reduced from 80
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 0, // Reduced space to Gravar button
    paddingHorizontal: 20,
  },
  carouselArrow: {
    padding: 8,
  },
  carouselContent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  carouselEmoji: {
    fontSize: 24, // Reduced from 32
    marginBottom: 4, // Reduced from 8
  },
  carouselText: {
    fontSize: 14, // Reduced from 16
    color: '#e5e7eb',
    textAlign: 'center',
    lineHeight: 20, // Reduced from 24
  },
  carouselDots: {
    flexDirection: 'row',
    marginTop: 10,
    position: 'absolute',
    bottom: -20,
  },
  carouselDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#4b5563',
    marginHorizontal: 4,
  },
  carouselDotActive: {
    backgroundColor: '#8b5cf6',
  },
  mainRecordButtonContainer: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    marginTop: 10,
    width: 200,
    height: 200,
  },
  energyRing: {
    position: 'absolute',
    borderRadius: 200,
  },
  ring1: {
    width: 170,
    height: 155,
    borderWidth: 3,
    borderColor: 'rgba(59, 130, 246, 0.7)',
    borderTopColor: 'transparent',
    borderRightColor: 'transparent',
  },
  ring2: {
    width: 150,
    height: 170,
    borderWidth: 2,
    borderColor: 'rgba(96, 165, 250, 0.5)',
    borderBottomColor: 'transparent',
  },
  ring3: {
    width: 180,
    height: 180,
    borderWidth: 1.5,
    borderColor: 'rgba(147, 197, 253, 0.4)',
    borderStyle: 'dashed',
  },
  mainRecordButton: {
    zIndex: 5,
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
    width: 150,
    height: 150,
  },
  mainRecordButtonOuter: {
    position: 'absolute',
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: 'rgba(239, 68, 68, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 15,
  },
  mainRecordButtonInner: {
    width: 150,
    height: 150,
    borderRadius: 75,
    backgroundColor: '#8b5cf6',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#8b5cf6',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 40,
    elevation: 20,
  },
  instruction: {
    fontSize: 16,
    color: '#9ca3af',
    marginBottom: 24,
  },
  textButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 25,
    borderWidth: 1,
    borderColor: '#8b5cf6',
    borderStyle: 'dashed',
  },
  textButtonLabel: {
    fontSize: 14,
    color: '#8b5cf6',
  },
  recordingContainer: {
    alignItems: 'center',
  },
  recordingVisualContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
    gap: 16,
  },
  waveformContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 100,
  },
  waveBar: {
    width: 6,
    height: 40,
    borderRadius: 3,
    backgroundColor: '#ef4444',
  },
  waveBarLeft: {
    opacity: 0.6,
  },
  waveBarMiddle: {
    opacity: 0.8,
  },
  waveBarRight: {
    opacity: 0.6,
  },
  listeningText: {
    fontSize: 16,
    color: '#9ca3af',
    marginBottom: 32,
    textAlign: 'center',
  },
  durationContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 32,
  },
  recordingIndicator: {
    width: 14,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#ef4444',
    marginRight: 12,
  },
  recordingIndicatorPaused: {
    backgroundColor: '#f59e0b',
  },
  durationText: {
    fontSize: 48,
    fontWeight: '300',
    color: '#fff',
    fontVariant: ['tabular-nums'],
  },
  pulsingCircle: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  recordingGlow: {
    position: 'absolute',
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: 'rgba(239, 68, 68, 0.2)',
  },
  recordingCircleInner: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: '#ef4444',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#ef4444',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 30,
    elevation: 15,
  },
  pausedCircle: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: '#f59e0b',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
    shadowColor: '#f59e0b',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 20,
    elevation: 10,
  },
  controlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 32,
  },
  controlBtn: {
    alignItems: 'center',
  },
  controlBtnInner: {
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  cancelBtn: {
    backgroundColor: '#374151',
  },
  pauseBtn: {
    backgroundColor: '#f59e0b',
  },
  resumeBtn: {
    backgroundColor: '#8b5cf6',
  },
  nextBtn: {
    backgroundColor: '#10b981',
  },
  controlLabel: {
    fontSize: 12,
    color: '#9ca3af',
  },
  previewContainer: {
    width: '100%',
  },
  previewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  previewTitle: {
    fontSize: 14,
    color: '#8b5cf6',
    fontWeight: '600',
  },
  transcriptionInput: {
    backgroundColor: '#1a1a24',
    borderRadius: 16,
    padding: 16,
    fontSize: 16,
    color: '#fff',
    minHeight: 150,
    maxHeight: 250,
    borderWidth: 1,
    borderColor: '#2d2d3a',
    marginBottom: 16,
  },
  previewActions: {
    flexDirection: 'row',
    gap: 12,
  },
  discardBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    paddingVertical: 14,
    borderRadius: 12,
    gap: 8,
  },
  discardBtnText: {
    color: '#ef4444',
    fontSize: 16,
    fontWeight: '600',
  },
  saveBtn: {
    flex: 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#8b5cf6',
    paddingVertical: 14,
    borderRadius: 12,
    gap: 8,
  },
  saveBtnDisabled: {
    backgroundColor: '#4b5563',
  },
  saveBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  manageMemoriesContainer: {
    paddingBottom: 24,
    marginTop: 20,
    width: '100%',
  },
  manageMemoriesButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(139, 92, 246, 0.1)',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(139, 92, 246, 0.2)',
  },
  manageMemoriesIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#8b5cf6',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
  },
  manageMemoriesTextContainer: {
    flex: 1,
  },
  manageMemoriesTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 4,
  },
  manageMemoriesSubtitle: {
    fontSize: 13,
    color: '#9ca3af',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#12121a',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    paddingBottom: Platform.OS === 'ios' ? 40 : 24,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
  },
  modalTextInput: {
    backgroundColor: '#1a1a24',
    borderRadius: 16,
    padding: 16,
    fontSize: 16,
    color: '#fff',
    minHeight: 150,
    maxHeight: 300,
    borderWidth: 1,
    borderColor: '#2d2d3a',
    marginBottom: 16,
  },
  dateOptionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 14,
    backgroundColor: '#1a1a24',
    borderRadius: 12,
    marginBottom: 12,
    gap: 10,
  },
  dateOptionText: {
    flex: 1,
    fontSize: 14,
    color: '#6b7280',
  },
  dateOptionTextActive: {
    color: '#8b5cf6',
  },
  dateInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1a1a24',
    borderRadius: 12,
    paddingHorizontal: 14,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#8b5cf6',
  },
  dateInput: {
    flex: 1,
    paddingVertical: 12,
    fontSize: 14,
    color: '#fff',
  },
  modalActions: {
    flexDirection: 'row',
    gap: 12,
  },
  modalCancelBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#374151',
  },
  modalCancelText: {
    color: '#9ca3af',
    fontSize: 16,
    fontWeight: '600',
  },
  modalSaveBtn: {
    flex: 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#8b5cf6',
    paddingVertical: 14,
    borderRadius: 12,
    gap: 8,
  },
  modalSaveBtnDisabled: {
    backgroundColor: '#4b5563',
  },
  modalSaveText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  emotionModalContent: {
    backgroundColor: '#12121a',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    paddingBottom: Platform.OS === 'ios' ? 40 : 24,
    alignItems: 'center',
  },
  emotionModalSubtitle: {
    fontSize: 15,
    color: '#9ca3af',
    marginBottom: 20,
    textAlign: 'center',
  },
  currentEmotionBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(139, 92, 246, 0.15)',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#8b5cf6',
    marginBottom: 24,
    justifyContent: 'center',
  },
  currentEmotionEmoji: {
    fontSize: 32,
    marginRight: 12,
  },
  currentEmotionText: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
    textTransform: 'capitalize',
  },
  emotionSuggestionsContainer: {
    width: '100%',
    marginBottom: 24,
  },
  emotionSuggestionsTitle: {
    fontSize: 14,
    color: '#9ca3af',
    marginBottom: 12,
    fontWeight: '600',
  },
  emotionOptions: {
    width: '100%',
    gap: 10,
  },
  emotionOptionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1a1a24',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#2d2d3a',
  },
  emotionOptionActive: {
    borderColor: '#8b5cf6',
    backgroundColor: 'rgba(139, 92, 246, 0.1)',
  },
  emotionOptionEmoji: {
    fontSize: 24,
    marginRight: 12,
  },
  emotionOptionText: {
    fontSize: 16,
    color: '#e5e7eb',
    fontWeight: '500',
    textTransform: 'capitalize',
  },
  emotionOptionTextActive: {
    color: '#8b5cf6',
    fontWeight: 'bold',
  },
  emotionIntensity: {
    fontSize: 12,
    color: '#6b7280',
    marginTop: 2,
  },
  emotionContinueBtn: {
    width: '100%',
    backgroundColor: '#8b5cf6',
    paddingVertical: 16,
    borderRadius: 16,
    alignItems: 'center',
  },
  emotionContinueText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  // ========== AI Loading Styles ==========
  aiLoadingContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
  },
  aiLoadingCircleWrapper: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  aiLoadingGlow: {
    position: 'absolute',
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: 'rgba(139, 92, 246, 0.3)',
  },
  aiLoadingCircle: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: '#8b5cf6',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#8b5cf6',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 30,
    elevation: 15,
  },
  aiLoadingText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#a78bfa',
    textAlign: 'center',
    marginBottom: 16,
    fontStyle: 'italic',
  },
  aiLoadingDots: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 16,
  },
  aiDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#8b5cf6',
  },
  aiLoadingSubtext: {
    fontSize: 14,
    color: '#6b7280',
  },
  // ========== Header Styles ==========
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  headerLeft: {
    flex: 1,
  },
});
