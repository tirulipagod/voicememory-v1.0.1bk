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
import { usePersona, LISTENING_PERSONAS } from '../../src/contexts/PersonaContext';
import { localStorage, LocalMemory } from '../../src/services/LocalStorage';
import { router } from 'expo-router';
import 'react-native-get-random-values';
import { v4 as uuidv4 } from 'uuid';

type RecordingState = 'idle' | 'recording' | 'paused' | 'preview' | 'saving';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// Sugestões reflexivas categorizadas
const REFLECTION_PROMPTS = [
  // Presente e dia a dia
  { text: "O que te fez sorrir hoje?", emoji: "😊", category: "presente" },
  { text: "Como você está se sentindo agora?", emoji: "💭", category: "presente" },
  { text: "Qual foi o momento mais marcante do dia?", emoji: "✨", category: "presente" },
  { text: "O que você é grato hoje?", emoji: "🙏", category: "presente" },
  { text: "O que você aprendeu recentemente?", emoji: "💡", category: "presente" },
  { text: "Quem fez diferença no seu dia?", emoji: "❤️", category: "presente" },
  { text: "O que te deixou ansioso?", emoji: "🌊", category: "presente" },
  { text: "Como foi sua energia hoje?", emoji: "⚡", category: "presente" },
  { text: "O que te trouxe paz hoje?", emoji: "🕊️", category: "presente" },
  { text: "Qual conversa te marcou?", emoji: "💬", category: "presente" },
  // Memórias do passado
  { text: "Qual lembrança te faz sorrir?", emoji: "🌈", category: "passado" },
  { text: "Que momento da infância você guarda?", emoji: "🧒", category: "passado" },
  { text: "Qual viagem marcou sua vida?", emoji: "✈️", category: "passado" },
  { text: "Quem você gostaria de agradecer?", emoji: "💝", category: "passado" },
  { text: "Que música te leva ao passado?", emoji: "🎵", category: "passado" },
  { text: "Qual foi seu momento mais corajoso?", emoji: "🦁", category: "passado" },
  { text: "Que lugar te traz saudade?", emoji: "🏠", category: "passado" },
  { text: "Qual foi a melhor surpresa que recebeu?", emoji: "🎁", category: "passado" },
  { text: "Que cheiro te lembra alguém especial?", emoji: "🌸", category: "passado" },
  { text: "Qual foi um dia perfeito na sua vida?", emoji: "☀️", category: "passado" },
  // Reflexão profunda
  { text: "O que você superou que te orgulha?", emoji: "💪", category: "reflexao" },
  { text: "Que sonho você ainda quer realizar?", emoji: "🌙", category: "reflexao" },
  { text: "O que você diria ao seu eu do passado?", emoji: "💌", category: "reflexao" },
  { text: "Qual momento mudou sua perspectiva?", emoji: "🔮", category: "reflexao" },
  { text: "O que te fez crescer como pessoa?", emoji: "🌱", category: "reflexao" },
  { text: "Que erro te ensinou uma lição valiosa?", emoji: "📚", category: "reflexao" },
  { text: "Qual foi sua maior conquista?", emoji: "🏆", category: "reflexao" },
  { text: "O que você deseja para o futuro?", emoji: "🌅", category: "reflexao" },
  { text: "Que memória você nunca quer esquecer?", emoji: "📸", category: "reflexao" },
  { text: "O que te faz sentir vivo?", emoji: "🔥", category: "reflexao" },
];

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
const PromptCarousel: React.FC<{ isVisible: boolean }> = ({ isVisible }) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(0)).current;

  // Embaralha e seleciona prompts únicos
  const [prompts] = useState(() =>
    [...REFLECTION_PROMPTS].sort(() => Math.random() - 0.5).slice(0, 10)
  );

  useEffect(() => {
    if (!isVisible) return;

    // Auto-rotate prompts every 5 seconds
    const interval = setInterval(() => {
      // Fade out
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 0,
          duration: 300,
          useNativeDriver: true,
        }),
        Animated.timing(slideAnim, {
          toValue: -20,
          duration: 300,
          useNativeDriver: true,
        }),
      ]).start(() => {
        setCurrentIndex((prev) => (prev + 1) % prompts.length);
        slideAnim.setValue(20);
        // Fade in
        Animated.parallel([
          Animated.timing(fadeAnim, {
            toValue: 1,
            duration: 300,
            useNativeDriver: true,
          }),
          Animated.timing(slideAnim, {
            toValue: 0,
            duration: 300,
            useNativeDriver: true,
          }),
        ]).start();
      });
    }, 5000);

    // Initial fade in
    fadeAnim.setValue(0);
    slideAnim.setValue(20);
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 500,
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 500,
        useNativeDriver: true,
      }),
    ]).start();

    return () => clearInterval(interval);
  }, [isVisible]);

  const goToNext = () => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 0, duration: 200, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: -20, duration: 200, useNativeDriver: true }),
    ]).start(() => {
      setCurrentIndex((prev) => (prev + 1) % prompts.length);
      slideAnim.setValue(20);
      Animated.parallel([
        Animated.timing(fadeAnim, { toValue: 1, duration: 200, useNativeDriver: true }),
        Animated.timing(slideAnim, { toValue: 0, duration: 200, useNativeDriver: true }),
      ]).start();
    });
  };

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

      {/* Dots indicator */}
      <View style={styles.carouselDots}>
        {prompts.slice(0, 5).map((_, index) => (
          <View
            key={index}
            style={[
              styles.carouselDot,
              currentIndex % 5 === index && styles.carouselDotActive
            ]}
          />
        ))}
      </View>
    </View>
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
  const { accessToken, user, syncWithDrive } = useAuth();
  const { selectedPersona, setSelectedPersona, currentPersona } = usePersona();
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
  const [showPersonaModal, setShowPersonaModal] = useState(false);

  const pulseAnim = useRef(new Animated.Value(1)).current;
  // Animações de waveform para feedback visual de captação
  const waveAnim1 = useRef(new Animated.Value(1)).current;
  const waveAnim2 = useRef(new Animated.Value(1)).current;
  const waveAnim3 = useRef(new Animated.Value(1)).current;
  const glowAnim = useRef(new Animated.Value(0)).current;
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

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

      // Try to analyze emotion with AI API
      let emotionResult = {
        emotion: 'neutro',
        emoji: '😐',
        score: 5,
        emotions: [] as Array<{ emotion: string; emoji: string; intensity: number }>,
        summary: ''
      };

      try {
        const backendUrl = process.env.EXPO_PUBLIC_BACKEND_URL || '';
        const response = await fetch(`${backendUrl}/api/analyze-emotion`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: transcription.trim() }),
        });

        if (response.ok) {
          const data = await response.json();
          emotionResult = {
            emotion: data.emotion || 'neutro',
            emoji: data.emotion_emoji || '😐',
            score: data.mood_score || 5,
            emotions: data.emotions || [],
            summary: data.summary || '',
          };
        } else {
          const localResult = analyzeEmotion(transcription);
          emotionResult = { ...emotionResult, emotion: localResult.emotion, emoji: localResult.emoji, score: localResult.score };
        }
      } catch (apiError) {
        console.log('API emotion analysis failed, using local:', apiError);
        const localResult = analyzeEmotion(transcription);
        emotionResult = { ...emotionResult, emotion: localResult.emotion, emoji: localResult.emoji, score: localResult.score };
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
        audioBase64: audioBase64 || undefined,
        durationSeconds: recordingDuration || undefined,
        segments: transcriptionSegments.length > 0 ? transcriptionSegments : undefined,
        emotions: emotionResult.emotions,
        summary: emotionResult.summary,
        createdAt: now,
        updatedAt: now,
        synced: false,
      };

      // Save locally
      await localStorage.saveMemory(memory);

      // Try to sync with Google Drive in background
      syncWithDrive().catch(err => console.log('Background sync failed:', err));

      setRecordingState('idle');
      setRecordingDuration(0);
      setAudioBase64(null);
      setTranscription('');
      setTranscriptionSegments([]);

      Alert.alert(
        '✨ Memória salva com sucesso!',
        `${emotionResult.emoji} ${emotionResult.emotion}${emotionResult.summary ? '\n\n' + emotionResult.summary : ''}`,
        [
          { text: 'Ver memórias', onPress: () => router.push('/(tabs)/memories') },
          { text: 'Continuar', style: 'cancel' },
        ]
      );
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

      // Try to analyze emotion with AI API
      let emotionResult = {
        emotion: 'neutro',
        emoji: '😐',
        score: 5,
        emotions: [] as Array<{ emotion: string; emoji: string; intensity: number }>,
        summary: ''
      };

      try {
        const backendUrl = process.env.EXPO_PUBLIC_BACKEND_URL || '';
        const response = await fetch(`${backendUrl}/api/analyze-emotion`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: textMemory.trim() }),
        });

        if (response.ok) {
          const data = await response.json();
          emotionResult = {
            emotion: data.emotion || 'neutro',
            emoji: data.emotion_emoji || '😐',
            score: data.mood_score || 5,
            emotions: data.emotions || [],
            summary: data.summary || '',
          };
        } else {
          // Fallback to local analysis
          const localResult = analyzeEmotion(textMemory);
          emotionResult = { ...emotionResult, ...localResult };
        }
      } catch (apiError) {
        console.log('API emotion analysis failed, using local:', apiError);
        const localResult = analyzeEmotion(textMemory);
        emotionResult = { ...emotionResult, emotion: localResult.emotion, emoji: localResult.emoji, score: localResult.score };
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
        createdAt: now,
        updatedAt: now,
        synced: false,
      };

      // Save locally
      await localStorage.saveMemory(memory);

      // Try to sync with Google Drive in background
      syncWithDrive().catch(err => console.log('Background sync failed:', err));

      setShowTextModal(false);
      setTextMemory('');
      setMemoryDate('');
      setShowDateInput(false);

      Alert.alert(
        '✨ Memória salva com sucesso!',
        `${emotionResult.emoji} ${emotionResult.emotion}${emotionResult.summary ? '\n\n' + emotionResult.summary : ''}`,
        [
          { text: 'Ver memórias', onPress: () => router.push('/(tabs)/memories') },
          { text: 'Continuar', style: 'cancel' },
        ]
      );
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
    <SafeAreaView style={styles.container}>
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
                  {recordingState === 'transcribing' && 'Transcrevendo áudio...'}
                  {recordingState === 'preview' && 'Revise e edite o texto'}
                  {recordingState === 'saving' && 'Salvando memória...'}
                </Text>
              </View>
              {/* Persona Selector Button - Minimalista */}
              <TouchableOpacity
                style={styles.personaHeaderBtn}
                onPress={() => setShowPersonaModal(true)}
                activeOpacity={0.7}
              >
                <Text style={styles.personaHeaderEmoji}>{currentPersona?.emoji}</Text>
              </TouchableOpacity>
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
                {/* Carrossel de sugestões simplificado */}
                <PromptCarousel isVisible={recordingState === 'idle'} />

                {/* Botão de Microfone Elevado - Maior e mais proeminente */}
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
                onPress={() => router.push('/memories_history')}
                activeOpacity={0.8}
              >
                <View style={styles.manageMemoriesIconContainer}>
                  <Ionicons name="library" size={24} color="#fff" />
                </View>
                <View style={styles.manageMemoriesTextContainer}>
                  <Text style={styles.manageMemoriesTitle}>Gerenciar Memórias</Text>
                  <Text style={styles.manageMemoriesSubtitle}>Ver histórico completo (Recentes, Jornada, Galeria)</Text>
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

      {/* Persona Selection Modal */}
      <Modal
        visible={showPersonaModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowPersonaModal(false)}
      >
        <View style={styles.personaModalOverlay}>
          <View style={styles.personaModalContent}>
            <View style={styles.personaModalHeader}>
              <Text style={styles.personaModalTitle}>Modo de Escuta</Text>
              <TouchableOpacity onPress={() => setShowPersonaModal(false)}>
                <Ionicons name="close" size={24} color="#9ca3af" />
              </TouchableOpacity>
            </View>
            <Text style={styles.personaModalSubtitle}>
              Escolha como a IA deve interpretar suas memórias
            </Text>

            <ScrollView style={styles.personaList} showsVerticalScrollIndicator={false}>
              {LISTENING_PERSONAS.map((persona) => (
                <TouchableOpacity
                  key={persona.id}
                  style={[
                    styles.personaCard,
                    selectedPersona === persona.id && { borderColor: persona.color, borderWidth: 2 }
                  ]}
                  onPress={() => {
                    setSelectedPersona(persona.id as any);
                    setShowPersonaModal(false);
                  }}
                >
                  <View style={[styles.personaIcon, { backgroundColor: persona.color + '20' }]}>
                    <Text style={styles.personaEmoji}>{persona.emoji}</Text>
                  </View>
                  <View style={styles.personaCardContent}>
                    <View style={styles.personaCardHeader}>
                      <Text style={styles.personaName}>{persona.name}</Text>
                      <Text style={[styles.personaSubtitle, { color: persona.color }]}>{persona.subtitle}</Text>
                    </View>
                    <Text style={styles.personaDescription}>{persona.description}</Text>
                  </View>
                  {selectedPersona === persona.id && (
                    <Ionicons name="checkmark-circle" size={24} color={persona.color} />
                  )}
                </TouchableOpacity>
              ))}
            </ScrollView>
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
  keyboardView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 24,
  },
  header: {
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
    paddingTop: 60,
    position: 'relative',
  },
  mainRecordButton: {
    marginBottom: 24,
    zIndex: 5,
  },
  mainRecordButtonOuter: {
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: 'rgba(139, 92, 246, 0.15)',
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
    height: 14,
    borderRadius: 7,
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
  // Carousel Styles
  carouselContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 32,
    paddingHorizontal: 8,
  },
  carouselArrow: {
    padding: 8,
  },
  carouselContent: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 8,
  },
  carouselEmoji: {
    fontSize: 32,
    marginBottom: 8,
  },
  carouselText: {
    fontSize: 16,
    color: '#9ca3af',
    textAlign: 'center',
    fontStyle: 'italic',
  },
  carouselDots: {
    position: 'absolute',
    bottom: -20,
    flexDirection: 'row',
    gap: 6,
    left: 0,
    right: 0,
    justifyContent: 'center',
  },
  carouselDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#374151',
  },
  carouselDotActive: {
    backgroundColor: '#8b5cf6',
    width: 16,
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
  personaHeaderBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(139, 92, 246, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(139, 92, 246, 0.3)',
  },
  personaHeaderEmoji: {
    fontSize: 22,
  },
  // ========== Persona Modal Styles ==========
  personaModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    justifyContent: 'flex-end',
  },
  personaModalContent: {
    backgroundColor: '#0a0a0f',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    paddingBottom: Platform.OS === 'ios' ? 40 : 20,
    maxHeight: '85%',
  },
  personaModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  personaModalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
  },
  personaModalSubtitle: {
    fontSize: 14,
    color: '#6b7280',
    marginBottom: 20,
  },
  personaList: {
    flex: 1,
  },
  personaCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1a1a24',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#2d2d3a',
  },
  personaIcon: {
    width: 50,
    height: 50,
    borderRadius: 25,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  personaEmoji: {
    fontSize: 24,
  },
  personaCardContent: {
    flex: 1,
  },
  personaCardHeader: {
    marginBottom: 4,
  },
  personaName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  personaSubtitle: {
    fontSize: 12,
    fontWeight: '500',
  },
  personaDescription: {
    fontSize: 12,
    color: '#9ca3af',
    lineHeight: 18,
  },
});
