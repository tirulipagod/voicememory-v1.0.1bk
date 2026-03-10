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
  Dimensions,
  Pressable,
  Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../src/contexts/AuthContext';
import { localStorage, LocalMemory } from '../../src/services/LocalStorage';
import { router, useFocusEffect } from 'expo-router';
import { useCallback } from 'react';
import Svg, { Polygon, Line, Circle, Text as SvgText, G, Rect } from 'react-native-svg';

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
  const emoji = EMOTION_EMOJIS[dominantEmotion] || emotions.find(e => e.emotion === dominantEmotion)?.emoji || '😐';
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
};

// Função para normalizar e traduzir emoção
const translateEmotion = (emotion: string): string => {
  const normalized = emotion.toLowerCase().trim();
  return EMOTION_TRANSLATION_MAP[normalized] || normalized;
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

// Radar Chart Component for Emotion Visualization
interface RadarChartProps {
  data: { label: string; value: number; color: string; emoji: string }[];
  size?: number;
}

const EmotionRadarChart: React.FC<RadarChartProps> = ({ data, size = 280 }) => {
  if (!data || data.length < 3) return null;

  const centerX = size / 2;
  const centerY = size / 2;
  const maxRadius = (size / 2) - 50;
  const levels = 4;

  // Calculate point positions
  const getPoint = (index: number, value: number, total: number) => {
    const angle = (Math.PI * 2 * index) / total - Math.PI / 2;
    const radius = (value / 100) * maxRadius;
    return {
      x: centerX + radius * Math.cos(angle),
      y: centerY + radius * Math.sin(angle),
    };
  };

  // Generate polygon points
  const points = data.map((item, index) => 
    getPoint(index, item.value, data.length)
  );
  const polygonPoints = points.map(p => `${p.x},${p.y}`).join(' ');

  // Generate axis lines and labels
  const axes = data.map((item, index) => {
    const endPoint = getPoint(index, 100, data.length);
    const labelPoint = getPoint(index, 120, data.length);
    return { endPoint, labelPoint, label: item.label, emoji: item.emoji };
  });

  return (
    <View style={radarStyles.container}>
      <Svg width={size} height={size}>
        {/* Background circles */}
        {[1, 2, 3, 4].map((level) => (
          <Circle
            key={level}
            cx={centerX}
            cy={centerY}
            r={(maxRadius * level) / levels}
            stroke="#2d2d3a"
            strokeWidth="1"
            fill="none"
          />
        ))}

        {/* Axis lines */}
        {axes.map((axis, index) => (
          <Line
            key={index}
            x1={centerX}
            y1={centerY}
            x2={axis.endPoint.x}
            y2={axis.endPoint.y}
            stroke="#2d2d3a"
            strokeWidth="1"
          />
        ))}

        {/* Data polygon */}
        <Polygon
          points={polygonPoints}
          fill="rgba(139, 92, 246, 0.3)"
          stroke="#8b5cf6"
          strokeWidth="2"
        />

        {/* Data points */}
        {points.map((point, index) => (
          <Circle
            key={index}
            cx={point.x}
            cy={point.y}
            r="5"
            fill={data[index].color}
            stroke="#fff"
            strokeWidth="2"
          />
        ))}
      </Svg>

      {/* Labels positioned around the chart */}
      {axes.map((axis, index) => (
        <View
          key={index}
          style={[
            radarStyles.labelContainer,
            {
              left: axis.labelPoint.x - 35,
              top: axis.labelPoint.y - 20,
            },
          ]}
        >
          <Text style={radarStyles.labelEmoji}>{axis.emoji}</Text>
          <Text style={radarStyles.labelText}>{axis.label}</Text>
          <Text style={radarStyles.labelValue}>{data[index].value.toFixed(0)}%</Text>
        </View>
      ))}
    </View>
  );
};

const radarStyles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  labelContainer: {
    position: 'absolute',
    alignItems: 'center',
    width: 70,
  },
  labelEmoji: {
    fontSize: 18,
  },
  labelText: {
    fontSize: 11,
    color: '#9ca3af',
    textAlign: 'center',
  },
  labelValue: {
    fontSize: 12,
    color: '#8b5cf6',
    fontWeight: '600',
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
      <View style={heatMapStyles.grid}>
        {stats.map((area) => {
          const areaConfig = LIFE_AREAS.find(a => a.id === area.id);
          const opacity = getOpacity(area.percentage);
          
          return (
            <View key={area.id} style={heatMapStyles.areaCard}>
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
            </View>
          );
        })}
      </View>
      
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
  const [moodChart, setMoodChart] = useState<{ points: MoodPoint[]; average: number; trend: string }>({ points: [], average: 0, trend: 'stable' });
  const [activeTab, setActiveTab] = useState<'discover' | 'emotions' | 'life' | 'timeline'>('discover');
  const [radarData, setRadarData] = useState<{ label: string; value: number; color: string; emoji: string }[]>([]);
  
  // New states for Personas and Life Areas
  const [selectedPersona, setSelectedPersona] = useState('therapeutic');
  const [showPersonaSelector, setShowPersonaSelector] = useState(false);
  const [lifeAreaStats, setLifeAreaStats] = useState<LifeAreaStat[]>([]);
  const [lifeAreaInsight, setLifeAreaInsight] = useState<string | null>(null);
  
  // State para memórias (para MonthEmotion) e streak
  const [memories, setMemories] = useState<LocalMemory[]>([]);
  const [streakDays, setStreakDays] = useState(0);

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

      // Calculate radar data from emotions
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
        memory_count: mems.length,
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

    // Take top 6 emotions for radar chart
    const topEmotions = emotionClusters
      .slice(0, 6)
      .map(cluster => ({
        label: cluster.emotion.charAt(0).toUpperCase() + cluster.emotion.slice(1),
        value: Math.min((cluster.count / totalMemories) * 100, 100),
        color: emotionColors[cluster.emotion.toLowerCase()] || '#8b5cf6',
        emoji: cluster.emoji,
      }));

    // Pad to minimum 5 items if needed
    while (topEmotions.length < 5 && topEmotions.length > 0) {
      topEmotions.push({
        label: '-',
        value: 0,
        color: '#374151',
        emoji: '·',
      });
    }

    return topEmotions;
  };

  const generateSections = (memories: LocalMemory[]): CuratedSection[] => {
    const sections: CuratedSection[] = [];

    // ⭐ Momentos Marcantes - High mood memories
    const happy = memories.filter(m => m.moodScore >= 7);
    if (happy.length > 0) {
      sections.push({
        id: 'happy',
        title: 'Momentos Marcantes',
        subtitle: 'Suas memórias mais luminosas',
        icon: 'star',
        color: '#f59e0b',
        memories: happy.slice(0, 5).map(m => ({
          id: m.id,
          transcription: m.transcription.substring(0, 100) + (m.transcription.length > 100 ? '...' : ''),
          emotion_emoji: m.emotionEmoji,
          created_at: m.createdAt,
          has_audio: !!m.audioBase64,
        })),
      });
    }

    // 💖 Memórias de Amor
    const love = memories.filter(m => 
      ['apaixonado', 'amor', 'amando', 'carinho', 'saudade'].some(k => 
        m.emotion.toLowerCase().includes(k) || m.transcription.toLowerCase().includes(k)
      )
    );
    if (love.length > 0) {
      sections.push({
        id: 'love',
        title: 'Memórias de Amor',
        subtitle: 'O carinho que você guardou',
        icon: 'heart',
        color: '#ec4899',
        memories: love.slice(0, 5).map(m => ({
          id: m.id,
          transcription: m.transcription.substring(0, 100) + (m.transcription.length > 100 ? '...' : ''),
          emotion_emoji: m.emotionEmoji,
          created_at: m.createdAt,
          has_audio: !!m.audioBase64,
        })),
      });
    }

    // 💪 Dias Difíceis que Passaram
    const difficult = memories.filter(m => m.moodScore <= 4);
    if (difficult.length > 0) {
      sections.push({
        id: 'difficult',
        title: 'Dias Difíceis que Passaram',
        subtitle: 'Você superou esses momentos',
        icon: 'fitness',
        color: '#8b5cf6',
        memories: difficult.slice(0, 5).map(m => ({
          id: m.id,
          transcription: m.transcription.substring(0, 100) + (m.transcription.length > 100 ? '...' : ''),
          emotion_emoji: m.emotionEmoji,
          created_at: m.createdAt,
          has_audio: !!m.audioBase64,
        })),
      });
    }

    // 📈 Sua Evolução - Compare first and recent memories
    if (memories.length >= 5) {
      const sortedByDate = [...memories].sort((a, b) => 
        new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
      );
      const firstMemories = sortedByDate.slice(0, 3);
      const recentMemories = sortedByDate.slice(-3);
      
      sections.push({
        id: 'evolution',
        title: 'Sua Evolução',
        subtitle: 'De onde você veio até aqui',
        icon: 'trending-up',
        color: '#10b981',
        memories: [...firstMemories.slice(0, 2), ...recentMemories.slice(0, 3)].map(m => ({
          id: m.id,
          transcription: m.transcription.substring(0, 100) + (m.transcription.length > 100 ? '...' : ''),
          emotion_emoji: m.emotionEmoji,
          created_at: m.createdAt,
          has_audio: !!m.audioBase64,
        })),
      });
    }

    // ☀️ Momentos de Gratidão
    const grateful = memories.filter(m => 
      ['grato', 'gratidão', 'agradeço', 'abençoado', 'sortudo', 'feliz'].some(k => 
        m.emotion.toLowerCase().includes(k) || m.transcription.toLowerCase().includes(k)
      )
    );
    if (grateful.length > 0) {
      sections.push({
        id: 'gratitude',
        title: 'Momentos de Gratidão',
        subtitle: 'As bênçãos que você reconheceu',
        icon: 'sunny',
        color: '#f59e0b',
        memories: grateful.slice(0, 5).map(m => ({
          id: m.id,
          transcription: m.transcription.substring(0, 100) + (m.transcription.length > 100 ? '...' : ''),
          emotion_emoji: m.emotionEmoji,
          created_at: m.createdAt,
          has_audio: !!m.audioBase64,
        })),
      });
    }

    // 🌿 Paz Interior
    const peaceful = memories.filter(m => 
      ['calmo', 'paz', 'tranquilo', 'sereno', 'relaxado', 'meditação'].some(k => 
        m.emotion.toLowerCase().includes(k) || m.transcription.toLowerCase().includes(k)
      )
    );
    if (peaceful.length > 0) {
      sections.push({
        id: 'peace',
        title: 'Paz Interior',
        subtitle: 'Seus momentos de serenidade',
        icon: 'leaf',
        color: '#14b8a6',
        memories: peaceful.slice(0, 5).map(m => ({
          id: m.id,
          transcription: m.transcription.substring(0, 100) + (m.transcription.length > 100 ? '...' : ''),
          emotion_emoji: m.emotionEmoji,
          created_at: m.createdAt,
          has_audio: !!m.audioBase64,
        })),
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
          emotion_emoji: random.emotionEmoji,
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
          emotion_emoji: random.emotionEmoji,
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
          emotion_emoji: random.emotionEmoji,
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
          emotion_emoji: random.emotionEmoji,
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
          emotion_emoji: random.emotionEmoji,
          created_at: random.createdAt,
        },
      });
    }

    // Shuffle and return max 3
    return suggestions.sort(() => Math.random() - 0.5).slice(0, 3);
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
    router.push(`/(tabs)/memories?emotion=${emotion}`);
  };

  const renderTimelineMonth = (month: MonthData) => {
    return (
      <TouchableOpacity
        key={month.month}
        style={styles.timelineMonth}
        onPress={() => {/* Could filter by month */}}
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
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#8b5cf6" />
          <Text style={styles.loadingText}>Explorando suas memórias...</Text>
        </View>
      </SafeAreaView>
    );
  }

  const hasData = timeline.length > 0 || emotions.length > 0 || sections.length > 0;

  return (
    <SafeAreaView style={styles.container}>
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
              <View style={styles.streakBadge}>
                <Text style={styles.streakEmoji}>🔥</Text>
                <View>
                  <Text style={styles.streakNumber}>{streakDays}</Text>
                  <Text style={styles.streakLabel}>dias</Text>
                </View>
              </View>
            )}
          </View>
        </View>

        {/* Tabs */}
        <View style={styles.tabs}>
          <TouchableOpacity
            style={[styles.tab, activeTab === 'discover' && styles.tabActive]}
            onPress={() => setActiveTab('discover')}
          >
            <Ionicons name="sparkles" size={18} color={activeTab === 'discover' ? '#8b5cf6' : '#6b7280'} />
            <Text style={[styles.tabText, activeTab === 'discover' && styles.tabTextActive]}>Descobrir</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tab, activeTab === 'emotions' && styles.tabActive]}
            onPress={() => setActiveTab('emotions')}
          >
            <Ionicons name="heart" size={18} color={activeTab === 'emotions' ? '#8b5cf6' : '#6b7280'} />
            <Text style={[styles.tabText, activeTab === 'emotions' && styles.tabTextActive]}>Emoções</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tab, activeTab === 'life' && styles.tabActive]}
            onPress={() => setActiveTab('life')}
          >
            <Ionicons name="grid" size={18} color={activeTab === 'life' ? '#8b5cf6' : '#6b7280'} />
            <Text style={[styles.tabText, activeTab === 'life' && styles.tabTextActive]}>Vida</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tab, activeTab === 'timeline' && styles.tabActive]}
            onPress={() => setActiveTab('timeline')}
          >
            <Ionicons name="calendar" size={18} color={activeTab === 'timeline' ? '#8b5cf6' : '#6b7280'} />
            <Text style={[styles.tabText, activeTab === 'timeline' && styles.tabTextActive]}>Timeline</Text>
          </TouchableOpacity>
        </View>

        <ScrollView
          contentContainerStyle={styles.scrollContent}
          refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} tintColor="#8b5cf6" />}
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
              {/* DISCOVER TAB */}
              {activeTab === 'discover' && (
                <>
                  {/* Revisit Suggestions */}
                  {revisit.length > 0 && (
                    <View style={styles.sectionContainer}>
                      <Text style={styles.sectionTitle}>Revisitar</Text>
                      <Text style={styles.sectionSubtitle}>Sugestões gentis para você</Text>
                      {revisit.map((suggestion) => (
                        <AnimatedRevisitCard 
                          key={suggestion.id} 
                          suggestion={suggestion} 
                          onPress={() => handleRevisitPress(suggestion)} 
                        />
                      ))}
                    </View>
                  )}

                  {/* Mood Chart */}
                  {renderMoodChart()}

                  {/* Curated Sections */}
                  {sections.map(renderCuratedSection)}
                </>
              )}

              {/* EMOTIONS TAB */}
              {activeTab === 'emotions' && (
                <View style={styles.emotionsContainer}>
                  {/* Radar Chart Section */}
                  {radarData.length >= 5 && (
                    <View style={styles.radarSection}>
                      <Text style={styles.sectionTitle}>Mapa de Emoções</Text>
                      <Text style={styles.sectionSubtitle}>Visualização das suas emoções dominantes</Text>
                      <View style={styles.radarChartWrapper}>
                        <EmotionRadarChart data={radarData} size={280} />
                      </View>
                    </View>
                  )}
                  
                  {/* Emotion Clusters */}
                  <Text style={[styles.sectionTitle, { marginTop: 24 }]}>Todas as Emoções</Text>
                  <Text style={styles.sectionSubtitle}>Toque para explorar cada emoção</Text>
                  <View style={styles.emotionGrid}>
                    {emotions.map((cluster) => (
                      <AnimatedEmotionCluster 
                        key={cluster.emotion} 
                        cluster={cluster} 
                        onPress={() => handleEmotionPress(cluster.emotion)} 
                      />
                    ))}
                  </View>
                </View>
              )}

              {/* LIFE AREAS TAB */}
              {activeTab === 'life' && (
                <View style={styles.lifeAreasContainer}>
                  <Text style={styles.sectionTitle}>Mapa de Calor da Vida</Text>
                  <Text style={styles.sectionSubtitle}>Quais áreas estão recebendo mais energia?</Text>
                  
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
              )}

              {/* TIMELINE TAB */}
              {activeTab === 'timeline' && (
                <View style={styles.timelineContainer}>
                  {/* ========== Emoção do Mês (Destaque) - Movido para Timeline ========== */}
                  <MonthEmotion emotions={emotions} memories={memories} />
                  
                  <Text style={styles.sectionTitle}>Linha do Tempo</Text>
                  <Text style={styles.sectionSubtitle}>Sua jornada mês a mês</Text>
                  {timeline.map(renderTimelineMonth)}
                </View>
              )}
            </>
          )}
        </ScrollView>
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
  },
  chartBars: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    height: 100,
  },
  chartBarContainer: {
    flex: 1,
    alignItems: 'center',
    marginHorizontal: 2,
  },
  chartBar: {
    width: '80%',
    borderRadius: 4,
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
    paddingVertical: 20,
    backgroundColor: '#1a1a24',
    borderRadius: 20,
    marginTop: 16,
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
});
