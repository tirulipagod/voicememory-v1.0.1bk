import React, { useState, useEffect, useRef, memo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Animated,
  Easing,
  Dimensions,
  Pressable,
  Modal,
  PanResponder,
  FlatList,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../src/contexts/AuthContext';
import { localStorage, LocalMemory } from '../../src/services/LocalStorage';
import { router, useFocusEffect } from 'expo-router';
import { useCallback } from 'react';
import Svg, { Polygon, Line, Circle, Text as SvgText, G, Rect } from 'react-native-svg';

const AnimatedG = Animated.createAnimatedComponent(G);

const { width } = Dimensions.get('window');

// ========== FUNÇÃO STREAK (Contador de Dias Seguidos) ==========
const calculateStreak = (memories: LocalMemory[]): number => {
  if (memories.length === 0) return 0;

  // Ordenar memórias por data de criação (mais recente primeiro)
  const sortedMemories = [...memories].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  // Obter datas únicas (em formato YYYY-MM-DD)
  const uniqueDates = [...new Set(
    sortedMemories.map(m => new Date(m.createdAt).toISOString().split('T')[0])
  )].sort((a, b) => new Date(b).getTime() - new Date(a).getTime());

  if (uniqueDates.length === 0) return 0;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayStr = today.toISOString().split('T')[0];

  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = yesterday.toISOString().split('T')[0];

  // Verificar se a última memória é de hoje ou ontem (senão o streak quebrou)
  const lastMemoryDate = uniqueDates[0];
  if (lastMemoryDate !== todayStr && lastMemoryDate !== yesterdayStr) {
    return 0; // Streak quebrado (mais de 48h sem registro)
  }

  let streak = 0;
  let currentDate = lastMemoryDate === todayStr ? today : yesterday;

  for (const dateStr of uniqueDates) {
    const currentDateStr = currentDate.toISOString().split('T')[0];

    if (dateStr === currentDateStr) {
      streak++;
      currentDate.setDate(currentDate.getDate() - 1);
    } else if (dateStr < currentDateStr) {
      // Gap encontrado, streak termina aqui
      break;
    }
  }

  return streak;
};

// ========== COMPONENTE EMOÇÃO DO MÊS ==========
interface MonthEmotionProps {
  emotions: EmotionCluster[];
  memories: LocalMemory[];
}

const EMOTION_EMOJIS: { [key: string]: string } = {
  'feliz': '😊',
  'triste': '😢',
  'ansioso': '😰',
  'calmo': '😌',
  'animado': '🤩',
  'frustrado': '😤',
  'grato': '🙏',
  'nostálgico': '🥺',
  'esperançoso': '✨',
  'cansado': '😴',
  'neutro': '😐',
  'apaixonado': '😍',
  'irritado': '😠',
  'surpreso': '😲',
  'confuso': '😕',
  'orgulhoso': '💪',
  'aliviado': '😮‍💨',
  'entediado': '😒',
  'preocupado': '😟',
  'tranquilo': '😌',
  'sereno': '🕊️',
  'reflexivo': '🤔',
  'motivado': '🚀',
  'inspirado': '💡',
};

const MonthEmotion: React.FC<MonthEmotionProps> = ({ emotions, memories }) => {
  // Calcular emoção dominante das últimas 4 semanas
  const fourWeeksAgo = new Date();
  fourWeeksAgo.setDate(fourWeeksAgo.getDate() - 28);

  const recentMemories = memories.filter(m => new Date(m.createdAt) >= fourWeeksAgo);

  if (recentMemories.length === 0 || emotions.length === 0) {
    return null;
  }

  // Contar emoções das últimas semanas
  const emotionCounts: { [key: string]: number } = {};
  recentMemories.forEach(m => {
    const emotion = translateEmotion(m.emotion);
    emotionCounts[emotion] = (emotionCounts[emotion] || 0) + 1;
  });

  // Encontrar emoção dominante
  const sortedEmotions = Object.entries(emotionCounts).sort(([, a], [, b]) => b - a);
  if (sortedEmotions.length === 0) return null;

  const [dominantEmotion, count] = sortedEmotions[0];
  const emoji = EMOTION_EMOJI_MAP[dominantEmotion] || EMOTION_EMOJIS[dominantEmotion] || emotions.find(e => e.emotion === dominantEmotion)?.emoji || '😐';
  const percentage = Math.round((count / recentMemories.length) * 100);

  return (
    <View style={monthEmotionStyles.container}>
      <View style={monthEmotionStyles.emojiContainer}>
        <Text style={monthEmotionStyles.emoji}>{emoji}</Text>
      </View>
      <Text style={monthEmotionStyles.title}>Seu último mês foi guiado pela:</Text>
      <Text style={monthEmotionStyles.emotion}>
        {dominantEmotion.charAt(0).toUpperCase() + dominantEmotion.slice(1)}
      </Text>
      <Text style={monthEmotionStyles.subtitle}>
        {percentage}% das {recentMemories.length} memórias recentes
      </Text>
    </View>
  );
};

const monthEmotionStyles = StyleSheet.create({
  container: {
    backgroundColor: '#1a1a24',
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
    marginBottom: 24,
    borderWidth: 1,
    borderColor: '#8b5cf620',
  },
  emojiContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(139, 92, 246, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  emoji: {
    fontSize: 48,
  },
  title: {
    fontSize: 14,
    color: '#9ca3af',
    marginBottom: 8,
  },
  emotion: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#8b5cf6',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 13,
    color: '#6b7280',
  },
});

// Mapa de tradução de emoções EN -> PT-BR
// Garante consistência nas labels quando o Gemini retorna em inglês
const EMOTION_TRANSLATION_MAP: { [key: string]: string } = {
  // Emoções básicas
  'happy': 'feliz',
  'sad': 'triste',
  'angry': 'irritado',
  'anxious': 'ansioso',
  'calm': 'calmo',
  'neutral': 'neutro',
  'excited': 'animado',
  'grateful': 'grato',
  'frustrated': 'frustrado',
  'nostalgic': 'nostálgico',
  'nostaugic_face': 'nostálgico',
  'nostalgic_face': 'nostálgico',
  'hopeful': 'esperançoso',
  'tired': 'cansado',
  'surprised': 'surpreso',
  'confused': 'confuso',
  'proud': 'orgulhoso',
  'relieved': 'aliviado',
  'bored': 'entediado',
  'worried': 'preocupado',
  'loving': 'apaixonado',
  'peaceful': 'sereno',
  'melancholic': 'melancólico',
  'satisfied': 'satisfeito',
  'reflective': 'reflexivo',
  'content': 'contente',
  'overwhelmed': 'sobrecarregado',
  'lonely': 'solitário',
  'inspired': 'inspirado',
  'nervous': 'nervoso',
  'disappointed': 'decepcionado',
  'motivated': 'motivado',
  'scared': 'assustado',
  'ashamed': 'envergonhado',
  'jealous': 'ciumento',
  'disgusted': 'enojado',
  'embarrassed': 'constrangido',
};

// Mapa de emojis para emoções
const EMOTION_EMOJI_MAP: { [key: string]: string } = {
  'feliz': '😊', 'happy': '😊',
  'triste': '😢', 'sad': '😢',
  'irritado': '😠', 'angry': '😠',
  'ansioso': '😰', 'anxious': '😰',
  'calmo': '😌', 'calm': '😌',
  'neutro': '😐', 'neutral': '😐',
  'animado': '🎉', 'excited': '🎉',
  'grato': '🙏', 'grateful': '🙏',
  'frustrado': '😫', 'frustrated': '😫',
  'nostálgico': '🥹', 'nostalgic': '🥹', 'nostaugic_face': '🥹', 'nostalgic_face': '🥹',
  'esperançoso': '🌟', 'hopeful': '🌟',
  'cansado': '😴', 'tired': '😴',
  'surpreso': '😲', 'surprised': '😲',
  'confuso': '😕', 'confused': '😕',
  'orgulhoso': '💪', 'proud': '💪',
  'aliviado': '😮‍💨', 'relieved': '😮‍💨',
  'entediado': '😒', 'bored': '😒',
  'preocupado': '😟', 'worried': '😟',
  'apaixonado': '❤️', 'loving': '❤️',
  'sereno': '🕊️', 'peaceful': '🕊️',
  'melancólico': '😔', 'melancholic': '😔',
  'satisfeito': '😊', 'satisfied': '😊',
  'reflexivo': '🤔', 'reflective': '🤔',
  'contente': '😄', 'content': '😄',
  'sobrecarregado': '😵', 'overwhelmed': '😵',
  'solitário': '😞', 'lonely': '😞',
  'inspirado': '✨', 'inspired': '✨',
  'nervoso': '😬', 'nervous': '😬',
  'decepcionado': '😞', 'disappointed': '😞',
  'motivado': '🔥', 'motivated': '🔥',
};

// Função para normalizar e traduzir emoção
const translateEmotion = (emotion: string): string => {
  const normalized = emotion.toLowerCase().trim();
  return EMOTION_TRANSLATION_MAP[normalized] || normalized;
};

// Helper para garantir renderização de emojis ao invés de strings cruas de banco antigo
const getSafeEmoji = (rawEmoji: string | undefined, emotionStr: string | undefined): string => {
  if (rawEmoji && rawEmoji.length <= 4 && /[\p{Emoji}]/u.test(rawEmoji)) {
    return rawEmoji;
  }
  const emotion = emotionStr || '';
  const translated = translateEmotion(emotion);
  return EMOTION_EMOJI_MAP[translated] || EMOTION_EMOJI_MAP[rawEmoji?.toLowerCase()?.trim() || ''] || '✨';
};

// Personas de Escuta
const LISTENING_PERSONAS = [
  {
    id: "mentor",
    name: "Mentor",
    subtitle: "Focado em Crescimento",
    icon: "trending-up",
    color: "#10b981",
    emoji: "🎯",
    description: "Analisa buscando padrões de produtividade, liderança e objetivos de carreira."
  },
  {
    id: "therapeutic",
    name: "Terapêutico",
    subtitle: "Focado em Acolhimento",
    icon: "heart",
    color: "#ec4899",
    emoji: "💗",
    description: "Validação emocional. Focado em como você se sente e dar nome às emoções."
  },
  {
    id: "philosophical",
    name: "Filosófico",
    subtitle: "Focado em Significado",
    icon: "infinite",
    color: "#8b5cf6",
    emoji: "🔮",
    description: "Perspectiva de longo prazo, conectando o presente com valores fundamentais."
  },
  {
    id: "coach",
    name: "Coach de Ação",
    subtitle: "Focado em Solução",
    icon: "flash",
    color: "#f59e0b",
    emoji: "⚡",
    description: "Para quem está 'travado'. Foca em ações práticas e pequenos passos."
  },
  {
    id: "documentarian",
    name: "Documentarista",
    subtitle: "Focado em Legado",
    icon: "book",
    color: "#3b82f6",
    emoji: "📚",
    description: "Não analisa, apenas organiza fatos. Ideal para biografias e memórias."
  }
];

// Áreas da Vida
const LIFE_AREAS = [
  { id: "work", name: "Trabalho & Carreira", icon: "briefcase", color: "#3b82f6", emoji: "💼" },
  { id: "relationships", name: "Relacionamentos", icon: "heart", color: "#ec4899", emoji: "❤️" },
  { id: "health", name: "Saúde & Energia", icon: "fitness", color: "#10b981", emoji: "🏃" },
  { id: "finances", name: "Finanças & Segurança", icon: "cash", color: "#eab308", emoji: "💰" },
  { id: "social", name: "Social & Amizades", icon: "people", color: "#f97316", emoji: "👥" },
  { id: "leisure", name: "Lazer & Espiritualidade", icon: "sparkles", color: "#a855f7", emoji: "✨" }
];

// Keywords para detecção local
const LIFE_AREA_KEYWORDS: { [key: string]: string[] } = {
  work: ["trabalho", "emprego", "escritório", "chefe", "reunião", "projeto", "deadline", "carreira", "promoção", "empresa", "cliente", "profissional"],
  relationships: ["amor", "namorado", "namorada", "esposo", "esposa", "família", "mãe", "pai", "filho", "filha", "casamento", "parceiro"],
  health: ["saúde", "academia", "exercício", "treino", "médico", "energia", "cansaço", "sono", "alimentação", "bem-estar"],
  finances: ["dinheiro", "conta", "banco", "investimento", "economia", "gasto", "salário", "dívida", "compra"],
  social: ["amigo", "amiga", "festa", "encontro", "sair", "balada", "bar", "restaurante", "grupo", "turma"],
  leisure: ["descanso", "relaxar", "hobby", "filme", "série", "música", "livro", "natureza", "viagem", "férias", "igreja", "oração", "meditação"]
};

// Animated Card Components (moved outside to avoid hook rules violation)
const AnimatedRevisitCard = memo(({ suggestion, onPress }: { suggestion: RevisitSuggestion; onPress: () => void }) => {
  const scaleAnim = useRef(new Animated.Value(1)).current;

  const onPressIn = () => {
    Animated.spring(scaleAnim, { toValue: 0.97, useNativeDriver: true }).start();
  };

  const onPressOut = () => {
    Animated.spring(scaleAnim, { toValue: 1, useNativeDriver: true }).start();
  };

  return (
    <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
      <TouchableOpacity
        style={styles.revisitCard}
        onPress={onPress}
        onPressIn={onPressIn}
        onPressOut={onPressOut}
        activeOpacity={0.9}
      >
        <View style={styles.revisitIcon}>
          <Ionicons name={suggestion.icon as any} size={24} color="#8b5cf6" />
        </View>
        <View style={styles.revisitContent}>
          <Text style={styles.revisitTitle}>{suggestion.title}</Text>
          <Text style={styles.revisitSubtitle}>{suggestion.subtitle}</Text>
        </View>
        <View style={styles.revisitAction}>
          <Text style={styles.revisitActionText}>{suggestion.action_text}</Text>
          <Ionicons name="chevron-forward" size={16} color="#8b5cf6" />
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
});

const AnimatedEmotionCluster = memo(({ cluster, onPress }: { cluster: EmotionCluster; onPress: () => void }) => {
  const scaleAnim = useRef(new Animated.Value(1)).current;

  return (
    <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
      <TouchableOpacity
        style={styles.emotionCluster}
        onPress={onPress}
        onPressIn={() => Animated.spring(scaleAnim, { toValue: 0.95, useNativeDriver: true }).start()}
        onPressOut={() => Animated.spring(scaleAnim, { toValue: 1, useNativeDriver: true }).start()}
        activeOpacity={0.9}
      >
        <Text style={styles.emotionClusterEmoji}>{cluster.emoji}</Text>
        <Text style={styles.emotionClusterName}>{cluster.emotion}</Text>
        <Text style={styles.emotionClusterCount}>{cluster.count}</Text>
        {cluster.insight && (
          <Text style={styles.emotionClusterInsight} numberOfLines={2}>
            {cluster.insight}
          </Text>
        )}
      </TouchableOpacity>
    </Animated.View>
  );
});

interface MonthData {
  month: string;
  month_label: string;
  count: number;
  avg_mood: number;
  dominant_emotion: string;
  dominant_emoji: string;
}

interface EmotionCluster {
  emotion: string;
  emoji: string;
  count: number;
  memories: any[];
  avg_mood?: number;
  insight?: string;
}

interface CuratedSection {
  id: string;
  title: string;
  subtitle: string;
  icon: string;
  color: string;
  memories: any[];
}

interface RevisitSuggestion {
  id: string;
  type: string;
  title: string;
  subtitle: string;
  memory?: any;
  action_text: string;
  icon: string;
}

interface MoodPoint {
  date: string;
  mood: number;
  emotion: string;
}

// Donut Chart Component for Emotion Visualization
interface DonutChartProps {
  data: { label: string; percentage: number; count: number; color: string; emoji: string }[];
  size?: number;
  onPressArc: (emotion: string) => void;
}

const EmotionDonutChart: React.FC<DonutChartProps> = ({ data, size = 110, onPressArc }) => {
  const [selected, setSelected] = useState(data[0]);
  const carouselRef = useRef<FlatList>(null);
  const orbitAnim = useRef(new Animated.Value(0)).current;
  const counterOrbitAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(1)).current;

  // High Precision Layout
  const CONTAINER_WIDTH = width - 40;
  const ARROW_BUTTON_WIDTH = 40;
  const VIEWPORT_WIDTH = CONTAINER_WIDTH - (ARROW_BUTTON_WIDTH * 2) - 10;
  const ITEM_WIDTH = VIEWPORT_WIDTH;

  useEffect(() => {
    // Parallel Orbits - Slower and more elegant
    Animated.loop(
      Animated.timing(orbitAnim, {
        toValue: 1,
        duration: 15000,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    ).start();

    Animated.loop(
      Animated.timing(counterOrbitAnim, {
        toValue: 1,
        duration: 20000,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    ).start();
  }, []);

  const drawSize = size + 120;
  const strokeWidth = 36;
  const radius = (size - strokeWidth) / 2;
  const center = drawSize / 2;
  const circumference = 2 * Math.PI * radius;

  const REPEAT_COUNT = 50;
  const infiniteData = React.useMemo(() => {
    return Array(REPEAT_COUNT).fill(data).flat();
  }, [data]);
  const middleIndex = Math.floor(REPEAT_COUNT / 2) * (data?.length || 1);
  const currentInfiniteIndex = useRef(middleIndex);

  useEffect(() => {
    if (data && data.length > 0) {
      let idx = data.findIndex(d => d.label === selected?.label);
      if (idx === -1) {
        idx = 0;
        setSelected(data[0]);
      }
      currentInfiniteIndex.current = middleIndex + idx;
      setTimeout(() => {
        carouselRef.current?.scrollToIndex({
          index: currentInfiniteIndex.current,
          animated: false,
          viewPosition: 0.5
        });
      }, 100);
    }
  }, [data]);

  useEffect(() => {
    Animated.sequence([
      Animated.timing(scaleAnim, { toValue: 1.1, duration: 150, useNativeDriver: true }),
      Animated.timing(scaleAnim, { toValue: 1.05, duration: 100, useNativeDriver: true }),
    ]).start();
  }, [selected]);

  // Compute angles for each item to allow spinning (with UI thread interpolation ranges)
  const donutData = React.useMemo(() => {
    let currentAngle = 0;
    return data.map((item) => {
      const sweep = (item.percentage / 100) * 360;
      const centerAngle = currentAngle + sweep / 2;
      currentAngle += sweep;

      let inputRange: number[] = [];
      let opacityOutputRange: number[] = [];
      let activeOutputRange: number[] = [];

      if (data.length === 1) {
        inputRange = [0, 360];
        opacityOutputRange = [1, 1];
        activeOutputRange = [1, 1];
      } else {
        const A = centerAngle - sweep / 2;
        const B = centerAngle + sweep / 2;

        if (A <= 0) {
          const wrappedA = 360 + A;
          inputRange = [0, B, B + 0.001, wrappedA - 0.001, wrappedA, 360];
          opacityOutputRange = [1, 1, 0.35, 0.35, 1, 1];
          activeOutputRange = [1, 1, 0, 0, 1, 1];
        } else if (B >= 360) {
          const wrappedB = B - 360;
          inputRange = [0, wrappedB, wrappedB + 0.001, A - 0.001, A, 360];
          opacityOutputRange = [1, 1, 0.35, 0.35, 1, 1];
          activeOutputRange = [1, 1, 0, 0, 1, 1];
        } else {
          inputRange = [0, A - 0.001, A, B, B + 0.001, 360];
          opacityOutputRange = [0.35, 0.35, 1, 1, 0.35, 0.35];
          activeOutputRange = [0, 0, 1, 1, 0, 0];
        }

        // Strictly increasing order enforcement
        let cleanInput: number[] = [];
        let cleanOpacity: number[] = [];
        let cleanActive: number[] = [];
        for (let i = 0; i < inputRange.length; i++) {
          if (cleanInput.length > 0 && inputRange[i] <= cleanInput[cleanInput.length - 1]) {
            cleanInput.push(cleanInput[cleanInput.length - 1] + 0.000001);
          } else {
            cleanInput.push(inputRange[i]);
          }
          cleanOpacity.push(opacityOutputRange[i]);
          cleanActive.push(activeOutputRange[i]);
        }

        inputRange = cleanInput;
        opacityOutputRange = cleanOpacity;
        activeOutputRange = cleanActive;
      }

      return { ...item, centerAngle, inputRange, opacityOutputRange, activeOutputRange };
    });
  }, [data]);

  const wheelAnim = useRef(new Animated.Value(0)).current;

  // React Native Continuous Modulus Engine
  const normalizedWheel = React.useMemo(() => {
    const invertWheel = Animated.multiply(wheelAnim, -1);
    const mod1 = Animated.modulo(invertWheel, 360);
    const add360 = Animated.add(mod1, 360);
    return Animated.modulo(add360, 360);
  }, [wheelAnim]);

  const currentRot = useRef(0);
  const donutRef = useRef<View>(null);
  const centerCoord = useRef({ x: 0, y: 0 });
  const startAngle = useRef<number | null>(null);
  const isDragging = useRef(false);

  useEffect(() => {
    const id = wheelAnim.addListener(({ value }) => {
      currentRot.current = value;
    });
    return () => wheelAnim.removeListener(id);
  }, [wheelAnim]);

  useEffect(() => {
    if (!donutData || donutData.length === 0 || isDragging.current) return;
    const selectedItem = donutData.find(d => d.label === selected?.label) || donutData[0];
    const targetAngle = -selectedItem.centerAngle;

    wheelAnim.flattenOffset();
    const current = currentRot.current;
    let diff = targetAngle - (current % 360);

    // Nearest path rotation to the target
    if (diff > 180) diff -= 360;
    if (diff < -180) diff += 360;

    Animated.timing(wheelAnim, {
      toValue: current + diff,
      duration: 500,
      useNativeDriver: true,
      easing: Easing.out(Easing.cubic)
    }).start();
  }, [selected, donutData]);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: (e) => {
        const { locationX, locationY } = e.nativeEvent;
        const dist = Math.sqrt(Math.pow(locationX - drawSize / 2, 2) + Math.pow(locationY - drawSize / 2, 2));
        if (dist < radius - 30) return false;
        return true;
      },
      onStartShouldSetPanResponderCapture: (e) => {
        const { locationX, locationY } = e.nativeEvent;
        const dist = Math.sqrt(Math.pow(locationX - drawSize / 2, 2) + Math.pow(locationY - drawSize / 2, 2));
        if (dist < radius - 30) return false;
        return true;
      },
      onMoveShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponderCapture: () => true,
      onPanResponderGrant: (e) => {
        isDragging.current = true;
        wheelAnim.stopAnimation();
        wheelAnim.extractOffset();
        donutRef.current?.measure((x, y, w, h, px, py) => {
          if (w > 0 && h > 0) {
            centerCoord.current = { x: px + w / 2, y: py + h / 2 };
            startAngle.current = Math.atan2(e.nativeEvent.pageY - centerCoord.current.y, e.nativeEvent.pageX - centerCoord.current.x) * (180 / Math.PI);
          }
        });
      },
      onPanResponderMove: (e) => {
        if (centerCoord.current.x !== 0 && centerCoord.current.y !== 0 && startAngle.current !== null) {
          const { pageX, pageY } = e.nativeEvent;
          const currentAngle = Math.atan2(pageY - centerCoord.current.y, pageX - centerCoord.current.x) * (180 / Math.PI);

          let diff = currentAngle - startAngle.current;
          if (diff > 180) diff -= 360;
          if (diff < -180) diff += 360;

          // Make the movement feel more cohesive and fluid (1:1 tracking)
          const newRot = (wheelAnim as any)._value + diff;
          wheelAnim.setValue(newRot);
          startAngle.current = currentAngle;

          // Internal logic only: We let JS know what segment is on top, but no setState here.
          // Visual cascata is 100% UI thread interpolation on wheelAnim internally.
        }
      },
      onPanResponderRelease: () => {
        wheelAnim.flattenOffset();
        const rot = currentRot.current;

        // CORRECTION 1: Smooth 0-360 normalization for JS state mapping, reversed for correct direction
        let normalizedRot = (-rot) % 360;
        if (normalizedRot < 0) normalizedRot += 360;

        // Determine standard block placement for snappiness robustly via minimum distance
        let currentIndex = 0;
        let minDiff = Infinity;
        for (let i = 0; i < donutData.length; i++) {
          const item = donutData[i];
          let diff = Math.abs(item.centerAngle - normalizedRot);
          if (diff > 180) diff = 360 - diff;
          if (diff < minDiff) {
            minDiff = diff;
            currentIndex = i;
          }
        }

        const newSelected = donutData[currentIndex];

        // CORRECTION 3: Target center angle snapping based on relative Delta!
        const targetAngle = newSelected.centerAngle;
        let delta = normalizedRot - targetAngle;

        // Ensure shortest path rotation lock
        if (delta > 180) delta -= 360;
        if (delta < -180) delta += 360;

        Animated.spring(wheelAnim, {
          toValue: rot + delta, // Positively advance delta for reversed standard
          useNativeDriver: true,
          friction: 9,   // High friction = no wobble, snaps solidly
          tension: 40    // Low tension = slower, giving a heavy object feel
        }).start(() => {
          isDragging.current = false;
        });

        if (selected?.label !== newSelected.label) {
          setSelected(newSelected);

          let indexDiff = currentIndex - (currentInfiniteIndex.current % data.length);
          if (indexDiff > data.length / 2) indexDiff -= data.length;
          if (indexDiff < -data.length / 2) indexDiff += data.length;
          currentInfiniteIndex.current += indexDiff;

          carouselRef.current?.scrollToIndex({
            index: currentInfiniteIndex.current,
            animated: true,
            viewPosition: 0.5
          });
        }
      }
    })
  ).current;

  if (!data || data.length === 0) return null;

  const current = selected || data[0];

  const handleSegmentPress = (item: any, index: number) => {
    setSelected(item);

    let indexDiff = index - (currentInfiniteIndex.current % data.length);
    if (indexDiff > data.length / 2) indexDiff -= data.length;
    if (indexDiff < -data.length / 2) indexDiff += data.length;
    currentInfiniteIndex.current += indexDiff;

    carouselRef.current?.scrollToIndex({
      index: currentInfiniteIndex.current,
      animated: true,
      viewPosition: 0.5
    });
  };

  const onMomentumScrollEnd = (event: any) => {
    const x = event.nativeEvent.contentOffset.x;

    // CORRECTION 2 (Atrito and Math constraint for true center index calculations)
    // Absolute pure math mapping index without gaps
    const index = Math.round(x / ITEM_WIDTH);

    if (infiniteData[index] && infiniteData[index].label !== selected?.label) {
      currentInfiniteIndex.current = index;
      setSelected(infiniteData[index]);
    }
  };

  let offset = 0;
  const orbitRotate = orbitAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });
  const counterRotate = counterOrbitAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['360deg', '0deg'],
  });

  const wheelRot = wheelAnim.interpolate({
    inputRange: [-360, 360],
    outputRange: ['-360deg', '360deg']
  });

  return (
    <View style={[donutStyles.container, { paddingVertical: 5 }]}>
      {/* Gráfico Donut com HUD Tech */}
      <View style={[donutStyles.chartWrapper, { height: drawSize, width: drawSize, marginTop: -30, marginBottom: -40 }]}>
        <Animated.View
          ref={donutRef}
          {...panResponder.panHandlers}
          style={{
            transform: [
              { scale: scaleAnim },
              { rotate: wheelRot }
            ],
            width: drawSize,
            height: drawSize,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: 'transparent'
          }}
        >
          <Svg
            width={drawSize}
            height={drawSize}
            viewBox={`0 0 ${drawSize} ${drawSize}`}
            style={{ position: 'absolute' }}
          >
            <G rotation="-90" origin={`${center}, ${center}`}>
              {donutData.map((item, index) => {
                const dash = (item.percentage / 100) * circumference;
                const gap = circumference - dash;
                const strokeDasharray = `${dash} ${gap}`;
                const currentOffset = circumference - offset;
                offset += dash;

                const animatedOpacity = normalizedWheel.interpolate({
                  inputRange: item.inputRange,
                  outputRange: item.opacityOutputRange,
                  extrapolate: 'clamp'
                });

                const animatedActive = normalizedWheel.interpolate({
                  inputRange: item.inputRange,
                  outputRange: item.activeOutputRange,
                  extrapolate: 'clamp'
                });

                return (
                  <G
                    key={index}
                    onPress={() => handleSegmentPress(item, index)}
                  >
                    {/* Shadow/Glow via Native Interpolation */}
                    <AnimatedG opacity={animatedActive}>
                      <Circle
                        cx={center}
                        cy={center}
                        r={radius}
                        stroke={item.color}
                        strokeWidth={strokeWidth + 12}
                        strokeDasharray={strokeDasharray}
                        strokeDashoffset={currentOffset}
                        fill="none"
                        opacity={0.3}
                        onPress={() => handleSegmentPress(item, index)}
                      />
                    </AnimatedG>

                    {/* Visual Segment via Native Interpolation */}
                    <AnimatedG opacity={animatedOpacity}>
                      <Circle
                        cx={center}
                        cy={center}
                        r={radius}
                        stroke={item.color}
                        strokeWidth={strokeWidth}
                        strokeDasharray={strokeDasharray}
                        strokeDashoffset={currentOffset}
                        fill="none"
                        onPress={() => handleSegmentPress(item, index)}
                      />
                    </AnimatedG>

                    {/* Dedicated Hit Area (Invisible but large) */}
                    <Circle
                      cx={center}
                      cy={center}
                      r={radius}
                      stroke="rgba(255,255,255,0.01)"
                      strokeWidth={strokeWidth + 40}
                      strokeDasharray={strokeDasharray}
                      strokeDashoffset={currentOffset}
                      fill="none"
                      onPress={() => handleSegmentPress(item, index)}
                    />
                  </G>
                );
              })}
            </G>
          </Svg>

          <Animated.View style={{
            position: 'absolute',
            width: drawSize,
            height: drawSize,
            transform: [{ rotate: orbitRotate }]
          }} pointerEvents="none">
            <Svg width={drawSize} height={drawSize} viewBox={`0 0 ${drawSize} ${drawSize}`}>
              <Circle
                cx={drawSize / 2}
                cy={drawSize / 2}
                r={radius + 34}
                stroke="#a78bfa"
                strokeWidth={2}
                strokeDasharray="20 180"
                fill="none"
                opacity={0.6}
              />
              <Circle
                cx={drawSize / 2}
                cy={drawSize / 2}
                r={radius + 34}
                stroke="#ffffff"
                strokeWidth={1}
                strokeDasharray="2 18"
                fill="none"
                opacity={0.4}
              />
            </Svg>
          </Animated.View>

          <Animated.View style={{
            position: 'absolute',
            width: drawSize,
            height: drawSize,
            transform: [{ rotate: counterRotate }]
          }} pointerEvents="none">
            <Svg width={drawSize} height={drawSize} viewBox={`0 0 ${drawSize} ${drawSize}`}>
              <Circle
                cx={drawSize / 2}
                cy={drawSize / 2}
                r={radius - 28}
                stroke="#ffffff"
                strokeWidth={1}
                strokeDasharray="40 160"
                fill="none"
                opacity={0.3}
              />
              {/* Small "Pulse" Scanner line */}
              <Circle
                cx={drawSize / 2}
                cy={drawSize / 2}
                r={radius - 28}
                stroke="#ffffff"
                strokeWidth={3}
                strokeDasharray="2 198"
                fill="none"
                opacity={0.8}
              />
            </Svg>
          </Animated.View>
        </Animated.View>

        {/* Info Central */}
        <View style={donutStyles.centerContent} pointerEvents="none">
          <Text style={donutStyles.centerEmoji}>{current?.emoji || '😐'}</Text>
          <Text style={donutStyles.centerLabel}>{current?.label || '-'}</Text>
          <Text style={donutStyles.centerPercent}>{Math.round(current?.percentage || 0)}%</Text>
        </View>
      </View>

      {/* Info de Total */}
      <View style={donutStyles.totalStats}>
        <Text style={donutStyles.totalStatsText}>
          {data.length} emoções registradas
        </Text>
      </View>

      {/* Control Container */}
      <View style={[donutStyles.carouselControlContainer, { marginTop: 10 }]}>
        <TouchableOpacity
          style={donutStyles.indicatorContainer}
          onPress={() => {
            currentInfiniteIndex.current -= 1;
            carouselRef.current?.scrollToIndex({
              index: currentInfiniteIndex.current,
              animated: true,
              viewPosition: 0.5
            });
            if (infiniteData[currentInfiniteIndex.current]) {
              setSelected(infiniteData[currentInfiniteIndex.current]);
            }
          }}
        >
          <Ionicons name="chevron-back" size={24} color="#a78bfa" />
        </TouchableOpacity>

        <View style={{ width: VIEWPORT_WIDTH, height: 60, overflow: 'hidden' }}>
          <FlatList
            ref={carouselRef}
            data={infiniteData}
            horizontal
            showsHorizontalScrollIndicator={false}
            snapToInterval={ITEM_WIDTH}
            snapToAlignment="center"
            decelerationRate="fast"
            onMomentumScrollEnd={onMomentumScrollEnd}
            scrollEventThrottle={16}
            getItemLayout={(data, index) => ({
              length: ITEM_WIDTH,
              offset: ITEM_WIDTH * index,
              index,
            })}
            keyExtractor={(_, index) => `item-${index}`}
            contentContainerStyle={{
              alignItems: 'center',
            }}
            renderItem={({ item, index }) => (
              <View style={{ width: ITEM_WIDTH, alignItems: 'center', justifyContent: 'center' }}>
                <TouchableOpacity
                  style={[
                    donutStyles.legendItem,
                    { width: ITEM_WIDTH - 16 },
                    selected?.label === item.label && donutStyles.legendItemActive
                  ]}
                  onPress={() => {
                    if (onPressArc) {
                      onPressArc(item.label.toLowerCase());
                    }
                    if (selected?.label !== item.label) {
                      handleSegmentPress(item, index);
                    }
                  }}
                >
                  <View style={[donutStyles.legendColorBox, { backgroundColor: item.color }]} />
                  <Text style={donutStyles.legendText} numberOfLines={1}>
                    {item.count} {item.label} ({Math.round(item.percentage)}%)
                  </Text>
                </TouchableOpacity>
              </View>
            )}
          />
        </View>

        <TouchableOpacity
          style={donutStyles.indicatorContainer}
          onPress={() => {
            currentInfiniteIndex.current += 1;
            carouselRef.current?.scrollToIndex({
              index: currentInfiniteIndex.current,
              animated: true,
              viewPosition: 0.5
            });
            if (infiniteData[currentInfiniteIndex.current]) {
              setSelected(infiniteData[currentInfiniteIndex.current]);
            }
          }}
        >
          <Ionicons name="chevron-forward" size={24} color="#a78bfa" />
        </TouchableOpacity>
      </View>
    </View >
  );
};

const donutStyles = StyleSheet.create({
  container: {
    alignItems: 'center',
    width: '100%',
  },
  chartWrapper: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  centerContent: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
    width: 150,
    height: 150,
  },
  centerEmoji: {
    fontSize: 32,
    marginBottom: 4,
  },
  centerLabel: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#fff',
    textTransform: 'capitalize',
  },
  centerPercent: {
    fontSize: 14,
    color: '#9ca3af',
  },
  legendContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  carouselControlContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    marginTop: 20,
    gap: 10,
  },
  indicatorContainer: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(139, 92, 246, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1f1f2e',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'transparent',
    justifyContent: 'center',
  },
  legendItemActive: {
    borderColor: '#8b5cf6',
    backgroundColor: 'rgba(139, 92, 246, 0.15)',
  },
  legendColorBox: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginRight: 8,
  },
  legendText: {
    color: '#d1d5db',
    fontSize: 13,
  },
  totalStats: {
    marginTop: 15,
    backgroundColor: 'rgba(139, 92, 246, 0.1)',
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(139, 92, 246, 0.2)',
  },
  totalStatsText: {
    color: '#a78bfa',
    fontSize: 14,
    fontWeight: 'bold',
  },
});

// Life Area Heat Map Component
interface LifeAreaStat {
  id: string;
  name: string;
  icon: string;
  color: string;
  emoji: string;
  count: number;
  percentage: number;
  avg_mood: number;
  intensity: number;
}

interface LifeAreaHeatMapProps {
  stats: LifeAreaStat[];
  insight: string | null;
}

const LifeAreaHeatMap: React.FC<LifeAreaHeatMapProps> = ({ stats, insight }) => {
  if (!stats || stats.length === 0) return null;

  // Get max percentage for scaling
  const maxPercentage = Math.max(...stats.map(s => s.percentage), 1);

  const getOpacity = (percentage: number) => {
    return Math.max(0.2, percentage / maxPercentage);
  };

  const getMoodColor = (mood: number) => {
    if (mood >= 7) return '#10b981';
    if (mood >= 5) return '#eab308';
    return '#ef4444';
  };

  return (
    <View style={heatMapStyles.container}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={heatMapStyles.grid}>
        {stats.map((area) => {
          const areaConfig = LIFE_AREAS.find(a => a.id === area.id);
          const opacity = getOpacity(area.percentage);

          return (
            <TouchableOpacity
              key={area.id}
              style={heatMapStyles.areaCard}
              onPress={() => router.push(`/memories_history?search=${encodeURIComponent(area.id)}&title=${encodeURIComponent(area.name)}`)}
            >
              <View
                style={[
                  heatMapStyles.areaBackground,
                  { backgroundColor: areaConfig?.color || '#8b5cf6', opacity: opacity * 0.3 }
                ]}
              />
              <View style={heatMapStyles.areaContent}>
                <Text style={heatMapStyles.areaEmoji}>{area.emoji}</Text>
                <Text style={heatMapStyles.areaName} numberOfLines={1}>{area.name}</Text>
                <View style={heatMapStyles.areaStats}>
                  <Text style={[heatMapStyles.areaPercentage, { color: areaConfig?.color }]}>
                    {area.percentage.toFixed(0)}%
                  </Text>
                  {area.count > 0 && (
                    <View style={[heatMapStyles.moodBadge, { backgroundColor: getMoodColor(area.avg_mood) + '30' }]}>
                      <Text style={[heatMapStyles.moodText, { color: getMoodColor(area.avg_mood) }]}>
                        {area.avg_mood.toFixed(1)} ☺
                      </Text>
                    </View>
                  )}
                </View>
                <Text style={heatMapStyles.areaCount}>{area.count} menções</Text>
              </View>
              {/* Intensity bar */}
              <View style={heatMapStyles.intensityBarContainer}>
                <View
                  style={[
                    heatMapStyles.intensityBar,
                    { width: `${Math.min(100, area.percentage * 1.5)}%`, backgroundColor: areaConfig?.color }
                  ]}
                />
              </View>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {insight && (
        <View style={heatMapStyles.insightContainer}>
          <Ionicons name="sparkles" size={16} color="#f59e0b" />
          <Text style={heatMapStyles.insightText}>{insight}</Text>
        </View>
      )}
    </View>
  );
};

const heatMapStyles = StyleSheet.create({
  container: {
    marginTop: 16,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  areaCard: {
    width: (width - 60) / 2,
    backgroundColor: '#1a1a24',
    borderRadius: 14,
    padding: 14,
    position: 'relative',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#2d2d3a',
  },
  areaBackground: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: 14,
  },
  areaContent: {
    position: 'relative',
    zIndex: 1,
  },
  areaEmoji: {
    fontSize: 24,
    marginBottom: 6,
  },
  areaName: {
    fontSize: 12,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 6,
  },
  areaStats: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  areaPercentage: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  moodBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
  },
  moodText: {
    fontSize: 10,
    fontWeight: '600',
  },
  areaCount: {
    fontSize: 11,
    color: '#6b7280',
  },
  intensityBarContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 3,
    backgroundColor: '#2d2d3a',
  },
  intensityBar: {
    height: 3,
    borderRadius: 2,
  },
  insightContainer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    backgroundColor: '#1a1a24',
    borderRadius: 12,
    padding: 14,
    marginTop: 12,
    borderWidth: 1,
    borderColor: '#f59e0b30',
  },
  insightText: {
    flex: 1,
    fontSize: 13,
    color: '#d1d5db',
    lineHeight: 20,
  },
});

// Persona Selector Component
interface PersonaSelectorProps {
  selectedPersona: string;
  onSelect: (personaId: string) => void;
  visible: boolean;
  onClose: () => void;
}

const PersonaSelector: React.FC<PersonaSelectorProps> = ({ selectedPersona, onSelect, visible, onClose }) => {
  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={personaStyles.overlay}>
        <View style={personaStyles.modal}>
          <View style={personaStyles.header}>
            <Text style={personaStyles.title}>Como a IA deve te ouvir?</Text>
            <TouchableOpacity onPress={onClose}>
              <Ionicons name="close" size={24} color="#9ca3af" />
            </TouchableOpacity>
          </View>
          <Text style={personaStyles.subtitle}>
            Escolha a persona que melhor se adapta ao seu momento
          </Text>

          <ScrollView style={personaStyles.list} showsVerticalScrollIndicator={false}>
            {LISTENING_PERSONAS.map((persona) => (
              <TouchableOpacity
                key={persona.id}
                style={[
                  personaStyles.personaCard,
                  selectedPersona === persona.id && { borderColor: persona.color, borderWidth: 2 }
                ]}
                onPress={() => {
                  onSelect(persona.id);
                  onClose();
                }}
              >
                <View style={[personaStyles.personaIcon, { backgroundColor: persona.color + '20' }]}>
                  <Text style={personaStyles.personaEmoji}>{persona.emoji}</Text>
                </View>
                <View style={personaStyles.personaContent}>
                  <View style={personaStyles.personaHeader}>
                    <Text style={personaStyles.personaName}>{persona.name}</Text>
                    <Text style={[personaStyles.personaSubtitle, { color: persona.color }]}>{persona.subtitle}</Text>
                  </View>
                  <Text style={personaStyles.personaDescription}>{persona.description}</Text>
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
  );
};

const personaStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'flex-end',
  },
  modal: {
    backgroundColor: '#0a0a0f',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    maxHeight: '85%',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
  },
  subtitle: {
    fontSize: 14,
    color: '#6b7280',
    marginBottom: 20,
  },
  list: {
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
  personaContent: {
    flex: 1,
  },
  personaHeader: {
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

export default function ExploreScreen() {
  const { user } = useAuth();
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [timeline, setTimeline] = useState<MonthData[]>([]);
  const [emotions, setEmotions] = useState<EmotionCluster[]>([]);
  const [sections, setSections] = useState<CuratedSection[]>([]);
  const [revisit, setRevisit] = useState<RevisitSuggestion[]>([]);
  const [currentRevisitIndex, setCurrentRevisitIndex] = useState(0);
  const [moodChart, setMoodChart] = useState<{ points: MoodPoint[]; average: number; trend: string }>({ points: [], average: 0, trend: 'stable' });
  const [radarData, setRadarData] = useState<{ label: string; percentage: number; count: number; color: string; emoji: string }[]>([]);

  const [selectedPersona, setSelectedPersona] = useState('therapeutic');
  const [showPersonaSelector, setShowPersonaSelector] = useState(false);
  const [lifeAreaStats, setLifeAreaStats] = useState<LifeAreaStat[]>([]);
  const [lifeAreaInsight, setLifeAreaInsight] = useState<string | null>(null);
  const [radarTimeFilter, setRadarTimeFilter] = useState<'hoje' | 'semana' | 'mes' | 'tudo'>('tudo');
  const [isFilterExpanded, setIsFilterExpanded] = useState(false);

  // State para memórias (para MonthEmotion) e streak
  const [memories, setMemories] = useState<LocalMemory[]>([]);
  const [streakDays, setStreakDays] = useState(0);
  const [showStreakModal, setShowStreakModal] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState(new Date());

  const fadeAnim = useRef(new Animated.Value(0)).current;

  useFocusEffect(
    useCallback(() => {
      fetchAllData();
    }, [])
  );

  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 500,
      useNativeDriver: true,
    }).start();
  }, [isLoading]);

  // Auto-rotate revisit suggestions every 8 seconds
  useEffect(() => {
    if (revisit.length <= 1) return;
    const interval = setInterval(() => {
      setCurrentRevisitIndex(prev => (prev + 1) % revisit.length);
    }, 8000);
    return () => clearInterval(interval);
  }, [revisit.length]);

  const fetchAllData = async () => {
    try {
      // Get memories from local storage
      const allMemories = await localStorage.getMemories();
      setMemories(allMemories);

      // Calcular streak
      const streak = calculateStreak(allMemories);
      setStreakDays(streak);

      if (allMemories.length === 0) {
        setIsLoading(false);
        setIsRefreshing(false);
        return;
      }

      // Calculate timeline data
      const timelineData = calculateTimeline(allMemories);
      setTimeline(timelineData);

      // Calculate emotion clusters
      const emotionData = calculateEmotions(allMemories);
      setEmotions(emotionData);

      // Calculate radar data from emotions (initial load uses 'tudo')
      const radar = calculateRadarData(emotionData, allMemories.length);
      setRadarData(radar);

      // Calculate mood chart
      const moodData = calculateMoodChart(allMemories);
      setMoodChart(moodData);

      // Generate curated sections
      const sectionsData = generateSections(allMemories);
      setSections(sectionsData);

      // Generate revisit suggestions
      const revisitData = generateRevisitSuggestions(allMemories);
      setRevisit(revisitData);

      // Calculate life area stats locally
      const lifeStats = calculateLifeAreaStats(allMemories);
      setLifeAreaStats(lifeStats.stats);
      setLifeAreaInsight(lifeStats.insight);

    } catch (error) {
      console.error('Error fetching explore data:', error);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  // Re-calculate radar data when filter changes
  useEffect(() => {
    if (memories.length > 0) {
      const now = new Date();
      let filtered = memories;

      if (radarTimeFilter === 'hoje') {
        filtered = memories.filter(m => new Date(m.createdAt).toDateString() === now.toDateString());
      } else if (radarTimeFilter === 'semana') {
        const lastWeek = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        filtered = memories.filter(m => new Date(m.createdAt) >= lastWeek);
      } else if (radarTimeFilter === 'mes') {
        const lastMonth = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        filtered = memories.filter(m => new Date(m.createdAt) >= lastMonth);
      }

      const emotionData = calculateEmotions(filtered);
      const radar = calculateRadarData(emotionData, filtered.length);
      setRadarData(radar);
    } else {
      setRadarData([]);
    }
  }, [radarTimeFilter, memories]);

  // Calculate life area stats from memories
  const calculateLifeAreaStats = (memories: LocalMemory[]): { stats: LifeAreaStat[]; insight: string | null } => {
    const areaStats: { [key: string]: { count: number; totalMood: number } } = {};

    // Initialize all areas
    LIFE_AREAS.forEach(area => {
      areaStats[area.id] = { count: 0, totalMood: 0 };
    });

    // Count mentions and moods
    memories.forEach(memory => {
      const text = memory.transcription.toLowerCase();
      const mood = memory.moodScore;

      Object.entries(LIFE_AREA_KEYWORDS).forEach(([areaId, keywords]) => {
        const matches = keywords.filter(keyword => text.includes(keyword)).length;
        if (matches > 0) {
          areaStats[areaId].count += matches;
          areaStats[areaId].totalMood += mood;
        }
      });
    });

    // Calculate totals and percentages
    const totalMentions = Object.values(areaStats).reduce((sum, s) => sum + s.count, 0);

    const stats: LifeAreaStat[] = LIFE_AREAS.map(area => {
      const stat = areaStats[area.id];
      const percentage = totalMentions > 0 ? (stat.count / totalMentions) * 100 : 0;
      const avgMood = stat.count > 0 ? stat.totalMood / stat.count : 0;

      return {
        id: area.id,
        name: area.name,
        icon: area.icon,
        color: area.color,
        emoji: area.emoji,
        count: stat.count,
        percentage: Math.round(percentage * 10) / 10,
        avg_mood: Math.round(avgMood * 10) / 10,
        intensity: Math.min(100, Math.round(percentage * 2))
      };
    }).sort((a, b) => b.percentage - a.percentage);

    // Generate insight
    let insight: string | null = null;
    if (totalMentions > 5) {
      const topArea = stats[0];
      const hasLeisure = stats.find(s => s.id === 'leisure' && s.percentage > 5);
      const workPercentage = stats.find(s => s.id === 'work')?.percentage || 0;

      if (workPercentage > 50 && !hasLeisure) {
        insight = `Percebi que você fala muito sobre Trabalho (${workPercentage.toFixed(0)}%) mas quase não menciona Lazer. Talvez seja hora de equilibrar um pouco?`;
      } else if (topArea.percentage > 60) {
        insight = `Suas memórias estão concentradas em '${topArea.name}' (${topArea.percentage.toFixed(0)}%). Considere explorar outras áreas da vida.`;
      } else if (stats.filter(s => s.avg_mood >= 7 && s.count >= 2).length > 0) {
        const happyArea = stats.find(s => s.avg_mood >= 7 && s.count >= 2);
        if (happyArea) {
          insight = `Seu humor melhora quando fala de '${happyArea.name}' (média ${happyArea.avg_mood}). Que tal investir mais nisso?`;
        }
      }
    }

    return { stats, insight };
  };

  const calculateTimeline = (memories: LocalMemory[]): MonthData[] => {
    const months: { [key: string]: LocalMemory[] } = {};

    memories.forEach(m => {
      const date = new Date(m.createdAt);
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      if (!months[key]) months[key] = [];
      months[key].push(m);
    });

    const monthNames = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
      'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

    return Object.entries(months).map(([key, mems]) => {
      const [year, month] = key.split('-');
      const avgMood = mems.reduce((sum, m) => sum + m.moodScore, 0) / mems.length;
      const emotions = mems.map(m => m.emotion);
      const dominantEmotion = emotions.sort((a, b) =>
        emotions.filter(e => e === b).length - emotions.filter(e => e === a).length
      )[0];
      const dominantEmoji = mems.find(m => m.emotion === dominantEmotion)?.emotionEmoji || '😐';

      return {
        month: key,
        month_label: `${monthNames[parseInt(month) - 1]} ${year}`,
        count: mems.length,
        avg_mood: Math.round(avgMood * 10) / 10,
        dominant_emotion: dominantEmotion,
        dominant_emoji: dominantEmoji,
      };
    }).sort((a, b) => b.month.localeCompare(a.month));
  };

  const calculateEmotions = (memories: LocalMemory[]): EmotionCluster[] => {
    const emotionMap: { [key: string]: { count: number; emoji: string; moods: number[]; memories: any[] } } = {};

    memories.forEach(m => {
      // Traduz a emoção para PT-BR antes de agrupar
      const translatedEmotion = translateEmotion(m.emotion);

      if (!emotionMap[translatedEmotion]) {
        emotionMap[translatedEmotion] = { count: 0, emoji: m.emotionEmoji, moods: [], memories: [] };
      }
      emotionMap[translatedEmotion].count++;
      emotionMap[translatedEmotion].moods.push(m.moodScore);
      emotionMap[translatedEmotion].memories.push({
        id: m.id,
        transcription: m.transcription,
        created_at: m.createdAt,
      });
    });

    return Object.entries(emotionMap)
      .map(([emotion, data]) => ({
        emotion,
        emoji: data.emoji,
        count: data.count,
        memories: data.memories.slice(0, 5),
        avg_mood: Math.round((data.moods.reduce((a, b) => a + b, 0) / data.moods.length) * 10) / 10,
        insight: `Você se sentiu ${emotion} ${data.count} vez${data.count > 1 ? 'es' : ''}`,
      }))
      .sort((a, b) => b.count - a.count);
  };

  const calculateMoodChart = (memories: LocalMemory[]): { points: MoodPoint[]; average: number; trend: string } => {
    const last30Days = memories
      .filter(m => {
        const date = new Date(m.createdAt);
        const daysAgo = (Date.now() - date.getTime()) / (1000 * 60 * 60 * 24);
        return daysAgo <= 30;
      })
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

    const points = last30Days.map(m => ({
      date: m.createdAt.split('T')[0],
      mood: m.moodScore,
      emotion: m.emotion,
    }));

    const average = points.length > 0
      ? Math.round((points.reduce((sum, p) => sum + p.mood, 0) / points.length) * 10) / 10
      : 0;

    let trend = 'stable';
    if (points.length >= 2) {
      const firstHalf = points.slice(0, Math.floor(points.length / 2));
      const secondHalf = points.slice(Math.floor(points.length / 2));
      const firstAvg = firstHalf.reduce((sum, p) => sum + p.mood, 0) / firstHalf.length;
      const secondAvg = secondHalf.reduce((sum, p) => sum + p.mood, 0) / secondHalf.length;
      if (secondAvg - firstAvg > 0.5) trend = 'improving';
      else if (firstAvg - secondAvg > 0.5) trend = 'declining';
    }

    return { points, average, trend };
  };

  const calculateRadarData = (emotionClusters: EmotionCluster[], totalMemories: number) => {
    const emotionColors: { [key: string]: string } = {
      'feliz': '#10b981',
      'animado': '#22c55e',
      'grato': '#f59e0b',
      'calmo': '#3b82f6',
      'triste': '#6366f1',
      'ansioso': '#ef4444',
      'irritado': '#dc2626',
      'cansado': '#6b7280',
      'surpreso': '#8b5cf6',
      'esperançoso': '#14b8a6',
      'apaixonado': '#ec4899',
      'neutro': '#9ca3af',
    };

    const getDynamicColor = (str: string) => {
      const lower = str.toLowerCase();
      if (emotionColors[lower]) return emotionColors[lower];
      let hash = 0;
      for (let i = 0; i < lower.length; i++) {
        hash = lower.charCodeAt(i) + ((hash << 5) - hash);
      }
      return `hsl(${Math.abs(hash) % 360}, 65%, 55%)`;
    };

    // Take top emotions for chart
    const topEmotions = emotionClusters
      .map(cluster => ({
        label: cluster.emotion.charAt(0).toUpperCase() + cluster.emotion.slice(1),
        percentage: Math.min((cluster.count / totalMemories) * 100, 100),
        count: cluster.count,
        color: getDynamicColor(cluster.emotion),
        emoji: cluster.emoji,
      }))
      .sort((a, b) => b.count - a.count);

    return topEmotions;
  };

  const generateSections = (memories: LocalMemory[]): CuratedSection[] => {
    const sections: CuratedSection[] = [];
    const usedIds = new Set<string>(); // Track used memory IDs to avoid repetition

    const mapMemory = (m: LocalMemory) => ({
      id: m.id,
      transcription: m.transcription.substring(0, 100) + (m.transcription.length > 100 ? '...' : ''),
      emotion_emoji: getSafeEmoji(m.emotionEmoji, m.emotion),
      created_at: m.createdAt,
      has_audio: !!m.audioBase64,
    });

    const filterUnused = (list: LocalMemory[], max = 5) => {
      const unused = list.filter(m => !usedIds.has(m.id));
      const selected = unused.slice(0, max);
      selected.forEach(m => usedIds.add(m.id));
      return selected;
    };

    // ⭐ Momentos Marcantes - High mood memories
    const happy = memories.filter(m => m.moodScore >= 7);
    const happySelected = filterUnused(happy);
    if (happySelected.length > 0) {
      sections.push({
        id: 'happy',
        title: 'Momentos Marcantes',
        subtitle: 'Suas memórias mais luminosas',
        icon: 'star',
        color: '#f59e0b',
        memories: happySelected.map(mapMemory),
      });
    }

    // 💖 Memórias de Amor
    const love = memories.filter(m =>
      ['apaixonado', 'amor', 'amando', 'carinho', 'saudade'].some(k =>
        m.emotion.toLowerCase().includes(k) || m.transcription.toLowerCase().includes(k)
      )
    );
    const loveSelected = filterUnused(love);
    if (loveSelected.length > 0) {
      sections.push({
        id: 'love',
        title: 'Memórias de Amor',
        subtitle: 'O carinho que você guardou',
        icon: 'heart',
        color: '#ec4899',
        memories: loveSelected.map(mapMemory),
      });
    }

    // 💪 Dias Difíceis que Passaram
    const difficult = memories.filter(m => m.moodScore <= 4);
    const difficultSelected = filterUnused(difficult);
    if (difficultSelected.length > 0) {
      sections.push({
        id: 'difficult',
        title: 'Dias Difíceis que Passaram',
        subtitle: 'Você superou esses momentos',
        icon: 'fitness',
        color: '#8b5cf6',
        memories: difficultSelected.map(mapMemory),
      });
    }

    // 📈 Sua Evolução - Compare first and recent memories
    if (memories.length >= 5) {
      const sortedByDate = [...memories].sort((a, b) =>
        new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
      );
      const firstMemories = sortedByDate.slice(0, 3);
      const recentMemories = sortedByDate.slice(-3);
      const evolutionCandidates = [...firstMemories.slice(0, 2), ...recentMemories.slice(0, 3)];
      const evolutionSelected = filterUnused(evolutionCandidates);

      if (evolutionSelected.length > 0) {
        sections.push({
          id: 'evolution',
          title: 'Sua Evolução',
          subtitle: 'De onde você veio até aqui',
          icon: 'trending-up',
          color: '#10b981',
          memories: evolutionSelected.map(mapMemory),
        });
      }
    }

    // ☀️ Momentos de Gratidão
    const grateful = memories.filter(m =>
      ['grato', 'gratidão', 'agradeço', 'abençoado', 'sortudo', 'feliz'].some(k =>
        m.emotion.toLowerCase().includes(k) || m.transcription.toLowerCase().includes(k)
      )
    );
    const gratefulSelected = filterUnused(grateful);
    if (gratefulSelected.length > 0) {
      sections.push({
        id: 'gratitude',
        title: 'Momentos de Gratidão',
        subtitle: 'As bênçãos que você reconheceu',
        icon: 'sunny',
        color: '#f59e0b',
        memories: gratefulSelected.map(mapMemory),
      });
    }

    // 🌿 Paz Interior
    const peaceful = memories.filter(m =>
      ['calmo', 'paz', 'tranquilo', 'sereno', 'relaxado', 'meditação'].some(k =>
        m.emotion.toLowerCase().includes(k) || m.transcription.toLowerCase().includes(k)
      )
    );
    const peacefulSelected = filterUnused(peaceful);
    if (peacefulSelected.length > 0) {
      sections.push({
        id: 'peace',
        title: 'Paz Interior',
        subtitle: 'Seus momentos de serenidade',
        icon: 'leaf',
        color: '#14b8a6',
        memories: peacefulSelected.map(mapMemory),
      });
    }

    return sections;
  };

  const generateRevisitSuggestions = (memories: LocalMemory[]): RevisitSuggestion[] => {
    const suggestions: RevisitSuggestion[] = [];

    // Random happy memory
    const happy = memories.filter(m => m.moodScore >= 7);
    if (happy.length > 0) {
      const random = happy[Math.floor(Math.random() * happy.length)];
      suggestions.push({
        id: 'happy',
        type: 'happy_memory',
        title: 'Algo que te fez feliz',
        subtitle: random.transcription.substring(0, 50) + '...',
        icon: 'sunny',
        action_text: 'Revisitar',
        memory: {
          id: random.id,
          preview: random.transcription.substring(0, 100),
          emotion_emoji: getSafeEmoji(random.emotionEmoji, random.emotion),
          created_at: random.createdAt,
        },
      });
    }

    // Memory of gratitude
    const grateful = memories.filter(m =>
      ['grato', 'gratidão', 'agradeço', 'abençoado'].some(k =>
        m.emotion.toLowerCase().includes(k) || m.transcription.toLowerCase().includes(k)
      )
    );
    if (grateful.length > 0) {
      const random = grateful[Math.floor(Math.random() * grateful.length)];
      suggestions.push({
        id: 'grateful',
        type: 'grateful_memory',
        title: 'Um momento de gratidão',
        subtitle: random.transcription.substring(0, 50) + '...',
        icon: 'heart',
        action_text: 'Revisitar',
        memory: {
          id: random.id,
          preview: random.transcription.substring(0, 100),
          emotion_emoji: getSafeEmoji(random.emotionEmoji, random.emotion),
          created_at: random.createdAt,
        },
      });
    }

    // Peaceful/calm memory
    const peaceful = memories.filter(m =>
      ['calmo', 'paz', 'tranquilo', 'sereno', 'relaxado'].some(k =>
        m.emotion.toLowerCase().includes(k) || m.transcription.toLowerCase().includes(k)
      )
    );
    if (peaceful.length > 0) {
      const random = peaceful[Math.floor(Math.random() * peaceful.length)];
      suggestions.push({
        id: 'peaceful',
        type: 'peaceful_memory',
        title: 'Um momento de paz',
        subtitle: random.transcription.substring(0, 50) + '...',
        icon: 'leaf',
        action_text: 'Revisitar',
        memory: {
          id: random.id,
          preview: random.transcription.substring(0, 100),
          emotion_emoji: getSafeEmoji(random.emotionEmoji, random.emotion),
          created_at: random.createdAt,
        },
      });
    }

    // Proud/accomplished memory
    const proud = memories.filter(m =>
      ['orgulho', 'conquista', 'consegui', 'realizei', 'superei'].some(k =>
        m.emotion.toLowerCase().includes(k) || m.transcription.toLowerCase().includes(k)
      )
    );
    if (proud.length > 0) {
      const random = proud[Math.floor(Math.random() * proud.length)];
      suggestions.push({
        id: 'proud',
        type: 'proud_memory',
        title: 'Uma conquista sua',
        subtitle: random.transcription.substring(0, 50) + '...',
        icon: 'trophy',
        action_text: 'Revisitar',
        memory: {
          id: random.id,
          preview: random.transcription.substring(0, 100),
          emotion_emoji: getSafeEmoji(random.emotionEmoji, random.emotion),
          created_at: random.createdAt,
        },
      });
    }

    // Nostalgic/saudade memory
    const nostalgic = memories.filter(m =>
      ['saudade', 'nostálgico', 'lembranc', 'recordo'].some(k =>
        m.emotion.toLowerCase().includes(k) || m.transcription.toLowerCase().includes(k)
      )
    );
    if (nostalgic.length > 0) {
      const random = nostalgic[Math.floor(Math.random() * nostalgic.length)];
      suggestions.push({
        id: 'nostalgic',
        type: 'nostalgic_memory',
        title: 'Uma lembrança especial',
        subtitle: random.transcription.substring(0, 50) + '...',
        icon: 'time',
        action_text: 'Revisitar',
        memory: {
          id: random.id,
          preview: random.transcription.substring(0, 100),
          emotion_emoji: getSafeEmoji(random.emotionEmoji, random.emotion),
          created_at: random.createdAt,
        },
      });
    }

    // Shuffle and return all (we'll display 1 at a time)
    return suggestions.sort(() => Math.random() - 0.5);
  };

  const onRefresh = () => {
    setIsRefreshing(true);
    fetchAllData();
  };

  const getMoodColor = (mood: number) => {
    if (mood >= 7) return '#10b981';
    if (mood >= 4) return '#8b5cf6';
    return '#ef4444';
  };

  const getTrendIcon = (trend: string) => {
    if (trend === 'up') return 'trending-up';
    if (trend === 'down') return 'trending-down';
    return 'remove';
  };

  const renderMoodChart = () => {
    if (moodChart.points.length === 0) return null;

    const maxMood = 10;
    const chartHeight = 100;

    return (
      <View style={styles.moodChartContainer}>
        <View style={styles.moodChartHeader}>
          <Text style={styles.sectionTitle}>Humor dos últimos 30 dias</Text>
          <View style={styles.trendBadge}>
            <Ionicons name={getTrendIcon(moodChart.trend)} size={16} color={getMoodColor(moodChart.average)} />
            <Text style={[styles.trendText, { color: getMoodColor(moodChart.average) }]}>
              {moodChart.average.toFixed(1)}
            </Text>
          </View>
        </View>
        <View style={styles.chartArea}>
          <View style={styles.chartBars}>
            {moodChart.points.slice(-15).map((point, index) => (
              <View key={index} style={styles.chartBarContainer}>
                <View
                  style={[
                    styles.chartBar,
                    {
                      height: (point.mood / maxMood) * chartHeight,
                      backgroundColor: getMoodColor(point.mood),
                    },
                  ]}
                />
              </View>
            ))}
          </View>
        </View>
      </View>
    );
  };

  const handleRevisitPress = (suggestion: RevisitSuggestion) => {
    if (suggestion.memory) {
      router.push(`/memory/${suggestion.memory.id}`);
    }
  };

  const renderCuratedSection = (section: CuratedSection) => {
    const iconMap: Record<string, string> = {
      star: 'star',
      heart: 'heart',
      fitness: 'fitness',
      'trending-up': 'trending-up',
      sunny: 'sunny',
      leaf: 'leaf',
    };

    return (
      <View key={section.id} style={styles.curatedSection}>
        <View style={styles.curatedHeader}>
          <View style={[styles.curatedIcon, { backgroundColor: section.color + '20' }]}>
            <Ionicons name={iconMap[section.icon] as any || 'star'} size={20} color={section.color} />
          </View>
          <View style={styles.curatedTitles}>
            <Text style={styles.curatedTitle}>{section.title}</Text>
            <Text style={styles.curatedSubtitle}>{section.subtitle}</Text>
          </View>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.curatedScroll}>
          {section.memories.map((memory, index) => (
            <TouchableOpacity
              key={memory.id}
              style={[styles.curatedMemoryCard, { borderLeftColor: section.color }]}
              onPress={() => router.push(`/memory/${memory.id}`)}
            >
              <Text style={styles.curatedMemoryEmoji}>{memory.emotion_emoji}</Text>
              <Text style={styles.curatedMemoryText} numberOfLines={3}>
                {memory.transcription}
              </Text>
              {memory.has_audio && (
                <View style={styles.audioIndicator}>
                  <Ionicons name="volume-medium" size={12} color="#6b7280" />
                </View>
              )}
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>
    );
  };

  const handleEmotionPress = (emotion: string) => {
    router.push(`/memories_history?emotion=${emotion}`);
  };

  const renderTimelineMonth = (month: MonthData) => {
    return (
      <TouchableOpacity
        key={month.month}
        style={styles.timelineMonth}
        onPress={() => {/* Could filter by month */ }}
      >
        <View style={styles.timelineMonthLeft}>
          <Text style={styles.timelineMonthLabel}>{month.month_label}</Text>
          <Text style={styles.timelineMonthCount}>{month.count} memórias</Text>
        </View>
        <View style={styles.timelineMonthRight}>
          <Text style={styles.timelineMonthEmoji}>{month.dominant_emoji}</Text>
          <View style={[styles.moodDot, { backgroundColor: getMoodColor(month.avg_mood) }]} />
          <Text style={styles.timelineMonthMood}>{month.avg_mood}</Text>
        </View>
      </TouchableOpacity>
    );
  };

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#8b5cf6" />
          <Text style={styles.loadingText}>Explorando suas memórias...</Text>
        </View>
      </SafeAreaView>
    );
  }

  const hasData = timeline.length > 0 || emotions.length > 0 || sections.length > 0;

  const renderStreakCalendar = () => {
    const year = calendarMonth.getFullYear();
    const month = calendarMonth.getMonth();
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    // Obter datas únicas
    const activeDates = new Set(
      memories.map(m => {
        const d = new Date(m.createdAt);
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      })
    );

    const today = new Date();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

    const days = [];
    for (let i = 0; i < firstDay; i++) {
      days.push(<View key={`empty-${i}`} style={styles.calendarDayEmpty} />);
    }

    for (let i = 1; i <= daysInMonth; i++) {
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`;
      const isActive = activeDates.has(dateStr);
      const isToday = todayStr === dateStr;

      days.push(
        <View key={`day-${i}`} style={[styles.calendarDay, isActive && styles.calendarDayActive, isToday && styles.calendarDayToday]}>
          <Text style={[styles.calendarDayText, isActive && styles.calendarDayTextActive]}>{i}</Text>
          {isActive && <Text style={styles.calendarDayFire}>🔥</Text>}
        </View>
      );
    }

    const monthNames = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

    return (
      <Modal visible={showStreakModal} animationType="fade" transparent onRequestClose={() => setShowStreakModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Sua Ofensiva</Text>
              <TouchableOpacity onPress={() => setShowStreakModal(false)}>
                <Ionicons name="close" size={24} color="#9ca3af" />
              </TouchableOpacity>
            </View>

            <View style={styles.streakModalHeader}>
              <Text style={styles.streakModalFire}>🔥</Text>
              <Text style={styles.streakModalNumber}>{streakDays}</Text>
              <Text style={styles.streakModalLabel}>dias seguidos!</Text>
            </View>

            <View style={styles.calendarHeader}>
              <TouchableOpacity hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} onPress={() => setCalendarMonth(new Date(year, month - 1, 1))}>
                <Ionicons name="chevron-back" size={20} color="#8b5cf6" />
              </TouchableOpacity>
              <Text style={styles.calendarMonthName}>{monthNames[month]} {year}</Text>
              <TouchableOpacity hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} onPress={() => setCalendarMonth(new Date(year, month + 1, 1))}>
                <Ionicons name="chevron-forward" size={20} color="#8b5cf6" />
              </TouchableOpacity>
            </View>

            <View style={styles.calendarWeekdays}>
              {['D', 'S', 'T', 'Q', 'Q', 'S', 'S'].map((d, i) => (
                <Text key={i} style={styles.calendarWeekdayText}>{d}</Text>
              ))}
            </View>

            <View style={styles.calendarGrid}>
              {days}
            </View>
          </View>
        </View>
      </Modal>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <Animated.View style={[styles.content, { opacity: fadeAnim }]}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerRow}>
            <View>
              <Text style={styles.title}>Explorar</Text>
              <Text style={styles.subtitle}>Descubra padrões e revisiste memórias</Text>
            </View>
            {/* Streak Badge */}
            {streakDays > 0 && (
              <TouchableOpacity style={styles.streakBadge} onPress={() => setShowStreakModal(true)}>
                <Text style={styles.streakEmoji}>🔥</Text>
                <View>
                  <Text style={styles.streakNumber}>{streakDays}</Text>
                  <Text style={styles.streakLabel}>dias</Text>
                </View>
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* Header content below */}
        <ScrollView
          contentContainerStyle={[styles.scrollContent, { paddingBottom: 100 }]}
          showsVerticalScrollIndicator={false}
        >
          {!hasData ? (
            <View style={styles.emptyContainer}>
              <Ionicons name="telescope-outline" size={64} color="#4b5563" />
              <Text style={styles.emptyTitle}>Comece a explorar</Text>
              <Text style={styles.emptyText}>
                Grave mais memórias para descobrir{'\n'}padrões e insights sobre você
              </Text>
            </View>
          ) : (
            <>
              {/* === 1. TOP: DONUT CHART (OVERALL PANORAMA) === */}
              <View style={styles.emotionsContainer}>
                <View style={styles.radarSection}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 15, zIndex: 10 }}>
                    <View>
                      <Text style={styles.sectionTitle}>Panorama Emocional</Text>
                      <Text style={styles.sectionSubtitle}>Suas emoções recentes</Text>
                    </View>
                    <View style={styles.radarFilterContainer}>
                      <View style={[styles.radarFilterWrapper, isFilterExpanded && styles.radarFilterWrapperExpanded]}>
                        <TouchableOpacity
                          style={styles.radarFilterHeaderBtn}
                          onPress={() => setIsFilterExpanded(!isFilterExpanded)}
                        >
                          <Text style={styles.radarFilterTxtActive}>
                            {radarTimeFilter === 'hoje' ? 'Hoje' : radarTimeFilter === 'semana' ? 'Última Semana' : radarTimeFilter === 'mes' ? 'Último Mês' : 'Visão Geral'}
                          </Text>
                          <Ionicons name={isFilterExpanded ? "chevron-up" : "chevron-down"} size={14} color="#8b5cf6" />
                        </TouchableOpacity>

                        {isFilterExpanded && (
                          <View style={styles.radarFilterDropdown}>
                            {(['hoje', 'semana', 'mes', 'tudo'] as const).map((filter) => (
                              <TouchableOpacity
                                key={filter}
                                style={[
                                  styles.radarFilterDropdownItem,
                                  radarTimeFilter === filter && styles.radarFilterDropdownItemActive
                                ]}
                                onPress={() => {
                                  setRadarTimeFilter(filter);
                                  setIsFilterExpanded(false);
                                }}
                              >
                                <Text style={[
                                  styles.radarFilterTxt,
                                  radarTimeFilter === filter && styles.radarFilterTxtActive
                                ]}>
                                  {filter === 'hoje' ? 'Hoje' : filter === 'semana' ? 'Última Semana' : filter === 'mes' ? 'Último Mês' : 'Visão Geral'}
                                </Text>
                              </TouchableOpacity>
                            ))}
                          </View>
                        )}
                      </View>
                    </View>
                  </View>

                  {radarData.length > 0 ? (
                    <View style={styles.radarChartWrapper}>
                      <EmotionDonutChart data={radarData} size={280} onPressArc={handleEmotionPress} />
                    </View>
                  ) : (
                    <View style={styles.radarEmptyContainer}>
                      <Text style={styles.radarEmptyText}>Nenhum registro encontrado para este período.</Text>
                    </View>
                  )}
                </View>
              </View>

              {/* === 2. MIDDLE: REVISIT === */}
              {revisit.length > 0 && (
                <View style={styles.sectionContainer}>
                  <Text style={styles.sectionTitle}>Revisitar</Text>
                  <Text style={styles.sectionSubtitle}>Sugestões gentis para você</Text>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={{ gap: 12, paddingRight: 20 }}
                    snapToInterval={width * 0.85 + 12}
                    decelerationRate="fast"
                    style={{ marginHorizontal: -20, paddingHorizontal: 20 }}
                  >
                    {revisit.map((suggestion) => (
                      <View key={suggestion.id} style={{ width: width * 0.85 }}>
                        <AnimatedRevisitCard
                          suggestion={suggestion}
                          onPress={() => handleRevisitPress(suggestion)}
                        />
                      </View>
                    ))}
                  </ScrollView>
                </View>
              )}

              {/* === 3. BOTTOM: LIFE AREA (AI CONTEXT CAROUSEL) === */}
              <View style={styles.lifeAreasContainer}>
                <Text style={styles.sectionTitle}>Dimensões da Vida</Text>
                <Text style={styles.sectionSubtitle}>Como você distibui a sua energia</Text>
                <LifeAreaHeatMap stats={lifeAreaStats} insight={lifeAreaInsight} />

                {lifeAreaStats.length === 0 && (
                  <View style={styles.emptyLifeAreas}>
                    <Ionicons name="analytics-outline" size={48} color="#4b5563" />
                    <Text style={styles.emptyLifeAreasText}>
                      Grave mais memórias para ver{'\n'}como você distribui sua energia
                    </Text>
                  </View>
                )}
              </View>

              {/* === 3. MOOD CHART: LAST 30 DAYS === */}
              {renderMoodChart()}

              {/* === 4. OTHER FUNCTIONALITIES (TIMELINE, CURATED, REVISIT, ETC) === */}

              {/* Curated Sections */}
              {sections.map(renderCuratedSection)}
            </>
          )}
        </ScrollView>
        {renderStreakCalendar()}
      </Animated.View>

      {/* Persona Selector Modal */}
      <PersonaSelector
        selectedPersona={selectedPersona}
        onSelect={setSelectedPersona}
        visible={showPersonaSelector}
        onClose={() => setShowPersonaSelector(false)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a0f',
  },
  content: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#9ca3af',
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 8,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  streakBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 16,
    gap: 6,
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.3)',
  },
  streakEmoji: {
    fontSize: 22,
  },
  streakNumber: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#ef4444',
    textAlign: 'center',
  },
  streakLabel: {
    fontSize: 10,
    color: '#f87171',
    textAlign: 'center',
    textTransform: 'uppercase',
    fontWeight: '600',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#fff',
  },
  subtitle: {
    fontSize: 14,
    color: '#6b7280',
    marginTop: 4,
  },
  tabs: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    paddingVertical: 12,
    gap: 8,
  },
  tab: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: '#1a1a24',
    gap: 6,
  },
  tabActive: {
    backgroundColor: 'rgba(139, 92, 246, 0.15)',
  },
  tabText: {
    fontSize: 14,
    color: '#6b7280',
    fontWeight: '500',
  },
  tabTextActive: {
    color: '#8b5cf6',
  },
  scrollContent: {
    paddingBottom: 40,
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 80,
    paddingHorizontal: 40,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#fff',
    marginTop: 20,
  },
  emptyText: {
    fontSize: 15,
    color: '#6b7280',
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 22,
  },
  sectionContainer: {
    paddingHorizontal: 20,
    marginBottom: 28,
  },
  revisitDots: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
    marginTop: 12,
  },
  revisitDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#3d3d4a',
  },
  revisitDotActive: {
    backgroundColor: '#8b5cf6',
    width: 18,
    borderRadius: 3,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 4,
  },
  sectionSubtitle: {
    fontSize: 13,
    color: '#6b7280',
    marginBottom: 16,
  },
  revisitCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1a1a24',
    borderRadius: 16,
    padding: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#2d2d3a',
  },
  revisitIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(139, 92, 246, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  revisitContent: {
    flex: 1,
  },
  revisitTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#fff',
  },
  revisitSubtitle: {
    fontSize: 13,
    color: '#9ca3af',
    marginTop: 2,
  },
  revisitAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  revisitActionText: {
    fontSize: 13,
    color: '#8b5cf6',
    fontWeight: '500',
  },
  moodChartContainer: {
    paddingHorizontal: 20,
    marginBottom: 28,
  },
  moodChartHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  trendBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#1a1a24',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
  },
  trendText: {
    fontSize: 14,
    fontWeight: '600',
  },
  chartArea: {
    backgroundColor: '#1a1a24',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#2d2d3a',
    minHeight: 132,
  },
  chartBars: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-evenly',
    height: 100,
  },
  chartBarContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-end',
    marginHorizontal: 1,
    height: '100%',
  },
  chartBar: {
    width: 12,
    borderRadius: 6,
    minHeight: 4,
  },
  curatedSection: {
    marginBottom: 28,
  },
  curatedHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    marginBottom: 14,
  },
  curatedIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  curatedTitles: {
    flex: 1,
  },
  curatedTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  curatedSubtitle: {
    fontSize: 12,
    color: '#6b7280',
    marginTop: 2,
  },
  radarFilterContainer: {
    position: 'relative',
    alignItems: 'flex-end',
    zIndex: 10,
  },
  radarFilterWrapper: {
    backgroundColor: 'rgba(139, 92, 246, 0.1)',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(139, 92, 246, 0.3)',
  },
  radarFilterWrapperExpanded: {
    borderBottomRightRadius: 0,
    borderBottomLeftRadius: 0,
    backgroundColor: '#1a1a24',
  },
  radarFilterHeaderBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  radarFilterDropdown: {
    position: 'absolute',
    top: '100%',
    right: -1,
    backgroundColor: '#1a1a24',
    borderBottomRightRadius: 16,
    borderBottomLeftRadius: 16,
    borderWidth: 1,
    borderTopWidth: 0,
    borderColor: 'rgba(139, 92, 246, 0.3)',
    paddingBottom: 4,
    minWidth: '100%',
    zIndex: 20,
    overflow: 'hidden',
  },
  radarFilterDropdownItem: {
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  radarFilterDropdownItemActive: {
    backgroundColor: 'rgba(139, 92, 246, 0.15)',
  },
  radarFilterTxt: {
    fontSize: 13,
    color: '#9ca3af',
    fontWeight: '500',
    textAlign: 'center',
  },
  radarFilterTxtActive: {
    color: '#8b5cf6',
    fontWeight: 'bold',
    textAlign: 'center',
  },
  radarEmptyContainer: {
    height: 280,
    justifyContent: 'center',
    alignItems: 'center',
  },
  radarEmptyText: {
    color: '#6b7280',
    fontSize: 14,
    textAlign: 'center',
  },
  curatedScroll: {
    paddingLeft: 20,
  },
  curatedMemoryCard: {
    backgroundColor: '#1a1a24',
    borderRadius: 14,
    padding: 14,
    marginRight: 12,
    width: 180,
    borderLeftWidth: 3,
    borderWidth: 1,
    borderColor: '#2d2d3a',
  },
  curatedMemoryEmoji: {
    fontSize: 24,
    marginBottom: 8,
  },
  curatedMemoryText: {
    fontSize: 13,
    color: '#d1d5db',
    lineHeight: 18,
  },
  audioIndicator: {
    position: 'absolute',
    top: 10,
    right: 10,
  },
  emotionsContainer: {
    paddingHorizontal: 20,
  },
  radarSection: {
    marginBottom: 16,
  },
  radarChartWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 0,
    backgroundColor: '#1a1a24',
    borderRadius: 20,
    marginTop: 0,
    borderWidth: 1,
    borderColor: '#2d2d3a',
  },
  emotionGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  emotionCluster: {
    backgroundColor: '#1a1a24',
    borderRadius: 16,
    padding: 16,
    width: (width - 52) / 2,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#2d2d3a',
  },
  emotionClusterEmoji: {
    fontSize: 32,
    marginBottom: 8,
  },
  emotionClusterName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
    textTransform: 'capitalize',
  },
  emotionClusterCount: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#8b5cf6',
    marginTop: 4,
  },
  emotionClusterInsight: {
    fontSize: 11,
    color: '#6b7280',
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 15,
  },
  timelineContainer: {
    paddingHorizontal: 20,
  },
  timelineMonth: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#1a1a24',
    borderRadius: 14,
    padding: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#2d2d3a',
  },
  timelineMonthLeft: {},
  timelineMonthLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  timelineMonthCount: {
    fontSize: 13,
    color: '#6b7280',
    marginTop: 2,
  },
  timelineMonthRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  timelineMonthEmoji: {
    fontSize: 24,
  },
  moodDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  timelineMonthMood: {
    fontSize: 14,
    fontWeight: '600',
    color: '#9ca3af',
  },
  // Persona button styles
  personaButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1a1a24',
    marginHorizontal: 20,
    marginBottom: 12,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#2d2d3a',
  },
  personaButtonEmoji: {
    fontSize: 24,
    marginRight: 12,
  },
  personaButtonContent: {
    flex: 1,
  },
  personaButtonLabel: {
    fontSize: 11,
    color: '#6b7280',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  personaButtonValue: {
    fontSize: 15,
    fontWeight: '600',
    color: '#fff',
    marginTop: 2,
  },
  // Life Areas styles
  lifeAreasContainer: {
    paddingHorizontal: 20,
  },
  emptyLifeAreas: {
    alignItems: 'center',
    paddingVertical: 48,
  },
  emptyLifeAreasText: {
    marginTop: 16,
    fontSize: 14,
    color: '#6b7280',
    textAlign: 'center',
    lineHeight: 22,
  },
  // Calendar Modal Styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    padding: 20,
  },
  modalContent: {
    backgroundColor: '#1a1a24',
    borderRadius: 24,
    padding: 24,
    borderWidth: 1,
    borderColor: '#2d2d3a',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 10,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
  },
  streakModalHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'center',
    marginBottom: 24,
    gap: 8,
  },
  streakModalFire: {
    fontSize: 32,
  },
  streakModalNumber: {
    fontSize: 48,
    fontWeight: 'bold',
    color: '#f97316', // Orange
  },
  streakModalLabel: {
    fontSize: 18,
    fontWeight: '600',
    color: '#f97316',
  },
  calendarHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
    paddingHorizontal: 8,
  },
  calendarMonthName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#fff',
  },
  calendarWeekdays: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  calendarWeekdayText: {
    width: `${100 / 7}%`,
    textAlign: 'center',
    fontSize: 12,
    fontWeight: '600',
    color: '#6b7280',
  },
  calendarGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  calendarDayEmpty: {
    width: `${100 / 7}%`,
    aspectRatio: 1,
  },
  calendarDay: {
    width: `${100 / 7}%`,
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 2,
    position: 'relative',
  },
  calendarDayActive: {
    backgroundColor: 'rgba(249, 115, 22, 0.1)', // Light orange background
    borderRadius: 12,
  },
  calendarDayToday: {
    borderWidth: 1,
    borderColor: '#8b5cf6',
    borderRadius: 12,
  },
  calendarDayText: {
    fontSize: 14,
    color: '#9ca3af',
  },
  calendarDayTextActive: {
    color: '#f97316',
    fontWeight: 'bold',
    marginBottom: 8,
  },
  calendarDayFire: {
    fontSize: 12,
    position: 'absolute',
    bottom: 4,
  },
});
