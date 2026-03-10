import React, { useState, useEffect, useRef, memo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
  RefreshControl,
  Animated,
  Dimensions,
  Modal,
  Alert,
  Image,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../src/contexts/AuthContext';
import { localStorage, LocalMemory } from '../../src/services/LocalStorage';
import { router } from 'expo-router';
import { useFocusEffect } from 'expo-router';
import Constants from 'expo-constants';
import * as Application from 'expo-application';
import { GOOGLE_CONFIG } from '../../src/config/google';
import { AvatarWidget } from '../../src/components/AvatarWidget';

const { width } = Dimensions.get('window');

interface ProfileDimension {
  id: string;
  title: string;
  icon: string;
  color: string;
  insight: string;
  details?: string;
  confidence: number;
  examples: string[];
}

interface ProfileEvolution {
  period: string;
  label: string;
  summary: string;
  key_changes: string[];
}

interface ReflectionQuestion {
  id: string;
  question: string;
  context: string;
  related_dimension: string;
}

interface LivingProfile {
  user_id: string;
  generated_at: string;
  memory_count: number;
  profile_level: string;
  dimensions: ProfileDimension[];
  evolution: ProfileEvolution[];
  reflections: ReflectionQuestion[];
  summary: string;
  dominantEmotion?: string;
}

// Expandable Dimension Card Component
const DimensionCard = memo(({ dimension, onPress }: { dimension: ProfileDimension; onPress: () => void }) => {
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const [isExpanded, setIsExpanded] = useState(false);
  const expandAnim = useRef(new Animated.Value(0)).current;

  const iconMap: Record<string, string> = {
    brain: 'bulb-outline',
    heart: 'heart-outline',
    scale: 'git-compare-outline',
    flame: 'flame-outline',
    diamond: 'diamond-outline',
    people: 'people-outline',
    fitness: 'fitness-outline',
    leaf: 'leaf-outline',
  };

  const getConfidenceLabel = (confidence: number) => {
    if (confidence >= 0.7) return { label: 'Alta confiança', color: '#10b981' };
    if (confidence >= 0.4) return { label: 'Média confiança', color: '#eab308' };
    return { label: 'Coletando dados', color: '#6b7280' };
  };

  const conf = getConfidenceLabel(dimension.confidence);

  const toggleExpand = () => {
    const toValue = isExpanded ? 0 : 1;
    Animated.spring(expandAnim, {
      toValue,
      useNativeDriver: false,
      friction: 8,
    }).start();
    setIsExpanded(!isExpanded);
  };

  const expandedHeight = expandAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 120],
  });

  const rotateIcon = expandAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '90deg'],
  });

  return (
    <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
      <TouchableOpacity
        style={[styles.dimensionCard, { borderLeftColor: dimension.color }]}
        onPress={toggleExpand}
        onPressIn={() => Animated.spring(scaleAnim, { toValue: 0.98, useNativeDriver: true }).start()}
        onPressOut={() => Animated.spring(scaleAnim, { toValue: 1, useNativeDriver: true }).start()}
        activeOpacity={0.95}
      >
        <View style={styles.dimensionHeader}>
          <View style={[styles.dimensionIconContainer, { backgroundColor: dimension.color + '20' }]}>
            <Ionicons name={iconMap[dimension.icon] as any || 'help-outline'} size={20} color={dimension.color} />
          </View>
          <View style={styles.dimensionTitleContainer}>
            <Text style={styles.dimensionTitle}>{dimension.title}</Text>
            <View style={styles.confidenceBadge}>
              <View style={[styles.confidenceDot, { backgroundColor: conf.color }]} />
              <Text style={[styles.confidenceText, { color: conf.color }]}>{conf.label}</Text>
            </View>
          </View>
          <Animated.View style={{ transform: [{ rotate: rotateIcon }] }}>
            <Ionicons name="chevron-forward" size={18} color="#6b7280" />
          </Animated.View>
        </View>
        <Text style={styles.dimensionInsight}>{dimension.insight}</Text>

        {/* Expandable Content */}
        <Animated.View style={[styles.expandedContent, { maxHeight: expandedHeight, overflow: 'hidden' }]}>
          {dimension.details && (
            <Text style={styles.dimensionDetails}>{dimension.details}</Text>
          )}
          <TouchableOpacity
            style={styles.viewMoreButton}
            onPress={onPress}
          >
            <Text style={[styles.viewMoreText, { color: dimension.color }]}>Ver análise completa</Text>
            <Ionicons name="arrow-forward" size={14} color={dimension.color} />
          </TouchableOpacity>
        </Animated.View>
      </TouchableOpacity>
    </Animated.View>
  );
});

// Reflection Card Component
const ReflectionCard = memo(({ reflection }: { reflection: ReflectionQuestion }) => {
  return (
    <View style={styles.reflectionCard}>
      <View style={styles.reflectionIcon}>
        <Ionicons name="help-circle" size={24} color="#8b5cf6" />
      </View>
      <Text style={styles.reflectionQuestion}>{reflection.question}</Text>
      {reflection.context && (
        <Text style={styles.reflectionContext}>{reflection.context}</Text>
      )}
    </View>
  );
});

export default function ProfileScreen() {
  const { user, accessToken, signOut, syncWithDrive, syncStatus, refreshSyncStatus, isAdmin, resetDailyChallenges } = useAuth();
  const [profile, setProfile] = useState<LivingProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [selectedDimension, setSelectedDimension] = useState<ProfileDimension | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [showChallengeModal, setShowChallengeModal] = useState(false);
  const [showChallengeHistory, setShowChallengeHistory] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  // Estado para modal de erro de sincronização (substitui Alert para funcionar melhor no Web)
  const [syncErrorModal, setSyncErrorModal] = useState<{
    visible: boolean;
    title: string;
    message: string;
  }>({ visible: false, title: '', message: '' });
  const [devInfo, setDevInfo] = useState<{
    packageName: string;
    bundleId: string;
    scheme: string;
    androidSHA1: string;
  } | null>(null);

  const fadeAnim = useRef(new Animated.Value(0)).current;

  // Usar useFocusEffect para recarregar dados toda vez que a tab recebe foco
  // Isso garante que o contador de memórias esteja sempre atualizado
  useFocusEffect(
    useCallback(() => {
      fetchProfile();
      refreshSyncStatus();
    }, [])
  );

  // Load developer info when admin opens settings
  useEffect(() => {
    if (isAdmin && showSettings && !devInfo) {
      loadDevInfo();
    }
  }, [isAdmin, showSettings]);

  const loadDevInfo = async () => {
    try {
      const expoConfig = Constants.expoConfig;
      const manifest = Constants.manifest2 || Constants.manifest;

      // Get package name / bundle identifier
      const packageName = expoConfig?.android?.package || 'com.diariodevoz.app';
      const bundleId = expoConfig?.ios?.bundleIdentifier || 'com.diariodevoz.app';
      const rawScheme = expoConfig?.scheme;
      const scheme = Array.isArray(rawScheme) ? rawScheme[0] : (rawScheme || 'com.diariodevoz.app');

      // Try to get Android SHA-1 (only available in production builds)
      let androidSHA1 = 'Disponível apenas em builds de produção';
      try {
        if (Platform.OS === 'android') {
          const certFingerprint = await Application.getAndroidId();
          if (certFingerprint) {
            androidSHA1 = certFingerprint;
          }
        }
      } catch (e) {
        console.log('Could not get Android SHA-1:', e);
      }

      setDevInfo({
        packageName,
        bundleId,
        scheme,
        androidSHA1,
      });
    } catch (error) {
      console.error('Error loading dev info:', error);
    }
  };

  useEffect(() => {
    if (!isLoading) {
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 500,
        useNativeDriver: true,
      }).start();
    }
  }, [isLoading]);

  const fetchProfile = async (forceRefresh = false) => {
    try {
      // Get memories from local storage to generate profile
      const memories = await localStorage.getMemories();

      if (memories.length < 3) {
        setProfile({
          user_id: user?.id || '',
          generated_at: new Date().toISOString(),
          memory_count: memories.length,
          profile_level: 'basic',
          dimensions: [],
          evolution: [],
          reflections: [],
          summary: 'Continue gravando memórias para descobrir mais sobre você.',
          dominantEmotion: 'feliz',
        });
        setIsLoading(false);
        setIsRefreshing(false);
        return;
      }

      // Analyze memories for profile
      const emotionCounts: { [key: string]: number } = {};
      let totalMood = 0;
      const textContent = memories.map(m => m.transcription.toLowerCase()).join(' ');

      memories.forEach(m => {
        emotionCounts[m.emotion] = (emotionCounts[m.emotion] || 0) + 1;
        totalMood += m.moodScore;
      });

      const avgMood = totalMood / memories.length;
      const sortedEmotions = Object.entries(emotionCounts).sort(([, a], [, b]) => b - a);
      const dominantEmotion = sortedEmotions[0]?.[0] || 'neutro';
      const secondEmotion = sortedEmotions[1]?.[0] || null;

      // Analyze patterns in text
      const hasPlanning = ['planejando', 'planejar', 'objetivo', 'meta', 'futuro', 'quero'].some(k => textContent.includes(k));
      const hasEmotionalExpression = ['sinto', 'senti', 'emoção', 'coração', 'chorei', 'alegria'].some(k => textContent.includes(k));
      const hasSelfCriticism = ['deveria', 'precisava', 'errei', 'falha', 'não consegui', 'culpa'].some(k => textContent.includes(k));
      const hasRelationships = ['família', 'amigo', 'parceiro', 'namorado', 'esposa', 'filho', 'mãe', 'pai'].some(k => textContent.includes(k));
      const hasWork = ['trabalho', 'empresa', 'chefe', 'reunião', 'projeto', 'carreira'].some(k => textContent.includes(k));
      const hasRest = ['descanso', 'relaxar', 'férias', 'dormir', 'lazer', 'hobby'].some(k => textContent.includes(k));
      const hasStress = ['estresse', 'ansiedade', 'pressão', 'correria', 'cansado', 'exausto'].some(k => textContent.includes(k));
      const hasGratitude = ['grato', 'gratidão', 'agradeço', 'sorte', 'abençoado'].some(k => textContent.includes(k));

      // Get example memories for each dimension
      const getExamples = (filter: (m: LocalMemory) => boolean) => {
        return memories.filter(filter).slice(0, 2).map(m => m.transcription.substring(0, 80) + '...');
      };

      // Generate all 8 dimensions
      const dimensions: ProfileDimension[] = [
        {
          id: 'cognitive_identity',
          title: 'Identidade Cognitiva',
          icon: 'brain',
          color: '#8b5cf6',
          insight: hasPlanning
            ? 'Você demonstra uma mente orientada para o futuro, com tendência a planejar e estruturar suas ações.'
            : 'Você parece viver mais no momento presente, com uma abordagem espontânea da vida.',
          details: hasPlanning
            ? 'Suas memórias revelam uma pessoa que pensa no longo prazo, definindo metas e buscando sentido nas escolhas.'
            : 'Você demonstra flexibilidade mental e abertura para o que cada momento traz.',
          confidence: Math.min(memories.length / 25, 1),
          examples: getExamples(m => ['objetivo', 'plano', 'quero', 'vou'].some(k => m.transcription.toLowerCase().includes(k))),
        },
        {
          id: 'emotional_patterns',
          title: 'Padrões Emocionais',
          icon: 'heart',
          color: '#ec4899',
          insight: `Sua emoção mais frequente é "${dominantEmotion}"${secondEmotion ? `, seguida por "${secondEmotion}"` : ''}. Você registrou ${memories.length} memórias.`,
          details: hasEmotionalExpression
            ? 'Você expressa emoções de forma aberta e clara em suas memórias, o que indica boa consciência emocional.'
            : 'Você tende a processar emoções de forma mais interna, focando mais em fatos do que em sentimentos.',
          confidence: Math.min(memories.length / 20, 1),
          examples: getExamples(m => m.emotion === dominantEmotion),
        },
        {
          id: 'logic_emotion_balance',
          title: 'Lógica & Emoção',
          icon: 'scale',
          color: '#6366f1',
          insight: hasEmotionalExpression && hasPlanning
            ? 'Você equilibra bem o pensamento analítico com a expressão emocional.'
            : hasEmotionalExpression
              ? 'Você se guia mais pelo coração do que pela razão em suas reflexões.'
              : 'Você tende a analisar situações de forma mais racional e estruturada.',
          details: 'Este equilíbrio influencia como você toma decisões e se relaciona com os outros.',
          confidence: Math.min(memories.length / 20, 1),
          examples: [],
        },
        {
          id: 'under_pressure',
          title: 'Sob Pressão',
          icon: 'flame',
          color: '#f97316',
          insight: hasStress
            ? 'Em momentos de pressão, você demonstra consciência do estresse, o que é o primeiro passo para gerenciá-lo.'
            : 'Suas memórias não revelam muitos momentos de estresse intenso, o que pode indicar boa resiliência.',
          details: hasStress
            ? 'Reconhecer quando está sob pressão é importante. Observe seus padrões de resposta.'
            : 'Continue cultivando esse equilíbrio e as práticas que te ajudam a manter a calma.',
          confidence: Math.min(memories.length / 25, 1),
          examples: getExamples(m => ['estresse', 'pressão', 'difícil', 'cansado'].some(k => m.transcription.toLowerCase().includes(k))),
        },
        {
          id: 'core_values',
          title: 'Valores Centrais',
          icon: 'diamond',
          color: '#14b8a6',
          insight: [
            hasRelationships ? 'Relacionamentos' : null,
            hasWork ? 'Realização profissional' : null,
            hasGratitude ? 'Gratidão' : null,
            avgMood >= 7 ? 'Bem-estar' : null,
          ].filter(Boolean).slice(0, 3).join(', ') + ' parecem ser importantes para você.',
          details: 'Seus valores guiam suas escolhas e definem o que te traz satisfação.',
          confidence: Math.min(memories.length / 20, 1),
          examples: [],
        },
        {
          id: 'relationships',
          title: 'Relacionamentos',
          icon: 'people',
          color: '#f43f5e',
          insight: hasRelationships
            ? 'Você valoriza e reflete sobre suas conexões com outras pessoas.'
            : 'Suas memórias focam mais em experiências individuais do que em relacionamentos.',
          details: hasRelationships
            ? 'A presença de pessoas importantes aparece em suas reflexões, mostrando o valor que dá aos vínculos.'
            : 'Talvez você seja mais introspectivo ou prefira processar experiências internamente.',
          confidence: Math.min(memories.length / 25, 1),
          examples: getExamples(m => ['família', 'amigo', 'amor', 'parceiro'].some(k => m.transcription.toLowerCase().includes(k))),
        },
        {
          id: 'self_criticism',
          title: 'Autocrítica',
          icon: 'fitness',
          color: '#eab308',
          insight: hasSelfCriticism
            ? 'Você demonstra exigência consigo mesmo, o que pode ser motivador mas também fonte de pressão.'
            : 'Você parece ter uma relação equilibrada consigo mesmo, sem excesso de autocrítica.',
          details: hasSelfCriticism
            ? 'A autocrítica em doses certas impulsiona o crescimento, mas lembre-se de celebrar suas conquistas.'
            : 'Manter esse equilíbrio é saudável. Continue reconhecendo tanto o que precisa melhorar quanto o que já conquistou.',
          confidence: Math.min(memories.length / 25, 1),
          examples: getExamples(m => ['deveria', 'errei', 'preciso melhorar'].some(k => m.transcription.toLowerCase().includes(k))),
        },
        {
          id: 'work_life_balance',
          title: 'Equilíbrio',
          icon: 'leaf',
          color: '#22c55e',
          insight: hasRest
            ? 'Você demonstra consciência sobre a importância do descanso e do autocuidado.'
            : hasWork && !hasRest
              ? 'Suas memórias focam bastante em trabalho. Lembre-se de equilibrar com momentos de descanso.'
              : 'Você parece encontrar um bom equilíbrio entre diferentes áreas da vida.',
          details: 'O equilíbrio entre produtividade e descanso é fundamental para o bem-estar sustentável.',
          confidence: Math.min(memories.length / 25, 1),
          examples: getExamples(m => ['descanso', 'relaxar', 'lazer', 'trabalho'].some(k => m.transcription.toLowerCase().includes(k))),
        },
      ];

      // Generate evolution data if enough memories
      const evolution: ProfileEvolution[] = [];
      if (memories.length >= 5) {
        const sortedByDate = [...memories].sort((a, b) =>
          new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
        );
        const oldMemories = sortedByDate.slice(0, Math.floor(sortedByDate.length / 2));
        const newMemories = sortedByDate.slice(Math.floor(sortedByDate.length / 2));

        const oldAvgMood = oldMemories.reduce((sum, m) => sum + m.moodScore, 0) / oldMemories.length;
        const newAvgMood = newMemories.reduce((sum, m) => sum + m.moodScore, 0) / newMemories.length;

        evolution.push({
          period: 'now',
          label: 'Agora',
          summary: `Seu humor médio atual é ${newAvgMood.toFixed(1)}/10.`,
          key_changes: newAvgMood > oldAvgMood
            ? ['Seu humor melhorou comparado ao início']
            : newAvgMood < oldAvgMood
              ? ['Seu humor diminuiu um pouco']
              : ['Seu humor se manteve estável'],
        });
      }

      // Generate reflections
      const reflections: ReflectionQuestion[] = [
        {
          id: 'reflection_1',
          question: 'O que você gostaria de sentir mais frequentemente?',
          context: `Sua emoção dominante é "${dominantEmotion}".`,
          related_dimension: 'emotional_patterns',
        },
      ];

      if (hasSelfCriticism) {
        reflections.push({
          id: 'reflection_2',
          question: 'Você percebe que às vezes é muito exigente consigo mesmo?',
          context: 'Suas memórias mostram padrões de autocrítica.',
          related_dimension: 'self_criticism',
        });
      }

      if (!hasRest && hasWork) {
        reflections.push({
          id: 'reflection_3',
          question: 'Quando foi a última vez que você tirou um tempo só para descansar?',
          context: 'Você fala muito sobre trabalho, mas pouco sobre descanso.',
          related_dimension: 'work_life_balance',
        });
      }

      const profileLevel = memories.length >= 30 ? 'complete' : memories.length >= 10 ? 'intermediate' : 'basic';

      const summaryParts = [
        `Baseado em ${memories.length} memórias,`,
        `você demonstra uma tendência para se sentir "${dominantEmotion}".`,
        avgMood >= 7 ? 'Seu humor geral é positivo.' : avgMood >= 5 ? 'Seu humor é equilibrado.' : 'Você está passando por um momento mais desafiador.',
        hasRelationships ? 'Relacionamentos são importantes para você.' : '',
        profileLevel !== 'complete' ? 'Continue gravando para insights mais profundos.' : '',
      ].filter(Boolean);

      const fullProfile: LivingProfile = {
        user_id: user?.id || '',
        generated_at: new Date().toISOString(),
        memory_count: memories.length,
        profile_level: profileLevel,
        dimensions,
        evolution,
        reflections,
        summary: summaryParts.join(' '),
        dominantEmotion: dominantEmotion,
      };

      setProfile(fullProfile);
    } catch (error) {
      console.error('Error fetching profile:', error);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  const handleRefresh = () => {
    setIsRefreshing(true);
    fetchProfile(true);
  };

  const onPullRefresh = () => {
    setIsRefreshing(true);
    fetchProfile(false);
  };

  const handleLogout = () => {
    signOut();
    setTimeout(() => {
      router.replace('/login');
    }, 300);
  };

  const handleSync = async () => {
    setIsSyncing(true);
    try {
      const result = await syncWithDrive();
      if (result.success) {
        setSyncErrorModal({
          visible: true,
          title: '✅ Sincronizado!',
          message: result.message
        });
      } else {
        setSyncErrorModal({
          visible: true,
          title: 'Erro',
          message: result.message
        });
      }
    } catch (error: any) {
      // Verifica se é erro 401 (expiração de token OAuth)
      const errorMessage = error?.message || error?.toString() || '';
      const isAuthError = errorMessage.includes('401') ||
        errorMessage.includes('unauthorized') ||
        errorMessage.includes('Unauthorized') ||
        errorMessage.includes('token');

      if (isAuthError) {
        setSyncErrorModal({
          visible: true,
          title: '🔐 Funcionalidade Limitada',
          message: 'O Cloud Storage de testes (Google Drive) não está habilitado para contas de convidado na versão atual de preview.\n\n✅ Fique tranquilo! Suas memórias estão 100% seguras no armazenamento local do seu dispositivo.\n\nPara habilitar sincronização na nuvem, aguarde a versão final do app.'
        });
      } else {
        setSyncErrorModal({
          visible: true,
          title: '☁️ Sincronização Indisponível',
          message: 'Não foi possível conectar ao Google Drive neste momento.\n\n✅ Fique tranquilo: todas as suas memórias estão salvas localmente no seu dispositivo e não serão perdidas.\n\nTente novamente mais tarde ou verifique sua conexão.'
        });
      }
    } finally {
      setIsSyncing(false);
      refreshSyncStatus();
    }
  };

  const getProfileLevelInfo = (level: string) => {
    switch (level) {
      case 'complete':
        return { label: 'Perfil Completo', color: '#10b981', icon: 'checkmark-circle' };
      case 'intermediate':
        return { label: 'Perfil em Construção', color: '#eab308', icon: 'hourglass' };
      default:
        return { label: 'Perfil Inicial', color: '#6b7280', icon: 'sparkles' };
    }
  };

  const renderHeader = () => {
    return (
      <View style={styles.header}>
        <View style={[styles.headerTop, { justifyContent: 'flex-end' }]}>
          <View style={styles.headerButtons}>
            {/* Settings button moved to AvatarWidget */}
          </View>
        </View>
      </View>
    );
  };

  const renderSummary = () => {
    if (!profile) return null;

    return (
      <View style={styles.summarySection}>
        <View style={styles.summaryHeader}>
          <Ionicons name="sparkles" size={20} color="#8b5cf6" />
          <Text style={styles.sectionTitle}>Quem Você É Agora</Text>
        </View>
        <Text style={styles.summaryText}>{profile.summary}</Text>
      </View>
    );
  };

  const renderDimensions = () => {
    if (!profile || profile.dimensions.length === 0) return null;

    return (
      <View style={styles.dimensionsSection}>
        <Text style={styles.sectionTitle}>Suas Dimensões</Text>
        <Text style={styles.sectionSubtitle}>Toque para explorar cada aspecto</Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: 16, paddingRight: 20, paddingBottom: 10 }}
          snapToInterval={width * 0.85 + 16}
          decelerationRate="fast"
          style={{ marginHorizontal: -20, paddingHorizontal: 20 }}
        >
          {profile.dimensions.map((dimension) => (
            <View key={dimension.id} style={{ width: width * 0.85 }}>
              <DimensionCard
                dimension={dimension}
                onPress={() => setSelectedDimension(dimension)}
              />
            </View>
          ))}
        </ScrollView>
      </View>
    );
  };

  const renderEvolution = () => {
    if (!profile || profile.evolution.length === 0) return null;

    return (
      <View style={styles.evolutionSection}>
        <Text style={styles.sectionTitle}>Sua Evolução</Text>
        <Text style={styles.sectionSubtitle}>Como você mudou ao longo do tempo</Text>
        {profile.evolution.map((evo, index) => (
          <View key={index} style={styles.evolutionCard}>
            <View style={styles.evolutionDot} />
            <View style={styles.evolutionContent}>
              <Text style={styles.evolutionLabel}>{evo.label}</Text>
              <Text style={styles.evolutionSummary}>{evo.summary}</Text>
              {evo.key_changes.length > 0 && (
                <View style={styles.evolutionChanges}>
                  {evo.key_changes.map((change, i) => (
                    <View key={i} style={styles.changeItem}>
                      <Ionicons name="arrow-forward" size={12} color="#8b5cf6" />
                      <Text style={styles.changeText}>{change}</Text>
                    </View>
                  ))}
                </View>
              )}
            </View>
          </View>
        ))}
      </View>
    );
  };

  const renderReflections = () => {
    if (!profile || profile.reflections.length === 0) return null;

    return (
      <View style={styles.reflectionsSection}>
        <Text style={styles.sectionTitle}>Perguntas para Reflexão</Text>
        <Text style={styles.sectionSubtitle}>Convites gentis para sua consciência</Text>
        {profile.reflections.map((reflection) => (
          <ReflectionCard key={reflection.id} reflection={reflection} />
        ))}
      </View>
    );
  };

  const renderRefreshButton = () => (
    <TouchableOpacity
      style={styles.refreshButton}
      onPress={handleRefresh}
      disabled={isRefreshing}
    >
      {isRefreshing ? (
        <ActivityIndicator size="small" color="#8b5cf6" />
      ) : (
        <>
          <Ionicons name="refresh" size={18} color="#8b5cf6" />
          <Text style={styles.refreshButtonText}>Atualizar meu perfil</Text>
        </>
      )}
    </TouchableOpacity>
  );

  const renderDimensionModal = () => (
    <Modal
      visible={selectedDimension !== null}
      animationType="slide"
      transparent={true}
      onRequestClose={() => setSelectedDimension(null)}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          {selectedDimension && (
            <>
              <View style={styles.modalHeader}>
                <View style={[styles.modalIcon, { backgroundColor: selectedDimension.color + '20' }]}>
                  <Ionicons
                    name={getIconName(selectedDimension.icon)}
                    size={28}
                    color={selectedDimension.color}
                  />
                </View>
                <TouchableOpacity
                  style={styles.modalClose}
                  onPress={() => setSelectedDimension(null)}
                >
                  <Ionicons name="close" size={24} color="#9ca3af" />
                </TouchableOpacity>
              </View>
              <Text style={styles.modalTitle}>{selectedDimension.title}</Text>
              <Text style={styles.modalInsight}>{selectedDimension.insight}</Text>

              {selectedDimension.details && (
                <View style={styles.modalDetailsSection}>
                  <Text style={styles.modalSectionTitle}>Análise Detalhada</Text>
                  <Text style={styles.modalDetails}>{selectedDimension.details}</Text>
                </View>
              )}

              {selectedDimension.examples.length > 0 && (
                <View style={styles.modalExamplesSection}>
                  <Text style={styles.modalSectionTitle}>Das suas memórias</Text>
                  {selectedDimension.examples.map((example, i) => (
                    <View key={i} style={styles.exampleCard}>
                      <Ionicons name="chatbubble-outline" size={14} color="#6b7280" />
                      <Text style={styles.exampleText}>"{example}"</Text>
                    </View>
                  ))}
                </View>
              )}

              <View style={styles.confidenceSection}>
                <Text style={styles.confidenceLabel}>
                  Confiança: {Math.round(selectedDimension.confidence * 100)}%
                </Text>
                <View style={styles.confidenceBar}>
                  <View
                    style={[
                      styles.confidenceFill,
                      {
                        width: `${selectedDimension.confidence * 100}%`,
                        backgroundColor: selectedDimension.color
                      }
                    ]}
                  />
                </View>
              </View>
            </>
          )}
        </View>
      </View>
    </Modal>
  );

  const renderSettingsModal = () => (
    <Modal
      visible={showSettings}
      animationType="slide"
      transparent={true}
      onRequestClose={() => setShowSettings(false)}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.settingsModal}>
          <View style={styles.settingsHeader}>
            <Text style={styles.settingsTitle}>Configurações</Text>
            <TouchableOpacity onPress={() => setShowSettings(false)}>
              <Ionicons name="close" size={24} color="#9ca3af" />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.settingsContent} showsVerticalScrollIndicator={true}>
            <View style={styles.userInfo}>
              <View style={styles.settingsAvatarContainer}>
                <Text style={styles.settingsAvatarText}>
                  {user?.name?.charAt(0).toUpperCase()}
                </Text>
              </View>
              <View style={styles.userDetails}>
                <Text style={styles.settingsUserName}>{user?.name}</Text>
                <Text style={styles.settingsUserEmail}>{user?.email}</Text>
              </View>
            </View>

            <View style={styles.settingsDivider} />

            {/* Google Drive Sync Section */}
            <View style={styles.syncSection}>
              <View style={styles.syncHeader}>
                <Ionicons name="logo-google" size={22} color="#4285F4" />
                <Text style={styles.syncTitle}>Google Drive</Text>
              </View>
              <Text style={styles.syncDescription}>
                Suas memórias são sincronizadas automaticamente
              </Text>
              {syncStatus.lastSync && (
                <Text style={styles.syncLastSync}>
                  Último sync: {new Date(syncStatus.lastSync).toLocaleString('pt-BR')}
                </Text>
              )}
              {syncStatus.pendingChanges > 0 && (
                <Text style={styles.syncPending}>
                  {syncStatus.pendingChanges} alterações pendentes
                </Text>
              )}
              <TouchableOpacity
                style={styles.syncButton}
                onPress={handleSync}
                disabled={isSyncing}
              >
                {isSyncing ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <>
                    <Ionicons name="cloud-upload-outline" size={18} color="#fff" />
                    <Text style={styles.syncButtonText}>Sincronizar agora</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>

            <View style={styles.settingsDivider} />

            {/* Configuração de Tema */}
            <View style={styles.themeSection}>
              <View style={styles.settingsItemNoBorder}>
                <Ionicons name="color-palette-outline" size={22} color="#9ca3af" />
                <Text style={styles.settingsItemText}>Tema do Aplicativo</Text>
              </View>
              <View style={styles.themeOptionsRow}>
                <TouchableOpacity style={[styles.themeOption, styles.themeOptionActive]}>
                  <Ionicons name="moon" size={20} color="#8b5cf6" />
                  <Text style={[styles.themeOptionText, styles.themeOptionTextActive]}>Escuro</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.themeOption}>
                  <Ionicons name="sunny" size={20} color="#9ca3af" />
                  <Text style={styles.themeOptionText}>Claro</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.themeOption}>
                  <Ionicons name="phone-portrait-outline" size={20} color="#9ca3af" />
                  <Text style={styles.themeOptionText}>Sistema</Text>
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.settingsDivider} />

            <TouchableOpacity style={styles.settingsItem}>
              <Ionicons name="notifications-outline" size={22} color="#9ca3af" />
              <Text style={styles.settingsItemText}>Notificações</Text>
              <Ionicons name="chevron-forward" size={18} color="#6b7280" />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.settingsItem}
              onPress={() => {
                setShowSettings(false);
                router.push('/welcome');
              }}
            >
              <Ionicons name="flag-outline" size={22} color="#9ca3af" />
              <Text style={styles.settingsItemText}>Mudar meu Propósito</Text>
              <Ionicons name="chevron-forward" size={18} color="#6b7280" />
            </TouchableOpacity>

            <TouchableOpacity style={styles.settingsItem}>
              <Ionicons name="shield-outline" size={22} color="#9ca3af" />
              <Text style={styles.settingsItemText}>Privacidade</Text>
              <Ionicons name="chevron-forward" size={18} color="#6b7280" />
            </TouchableOpacity>

            <TouchableOpacity style={styles.settingsItem}>
              <Ionicons name="help-circle-outline" size={22} color="#9ca3af" />
              <Text style={styles.settingsItemText}>Ajuda</Text>
              <Ionicons name="chevron-forward" size={18} color="#6b7280" />
            </TouchableOpacity>

            {/* Developer Info Section - Admin Only */}
            {isAdmin && (
              <>
                <View style={styles.settingsDivider} />
                <View style={styles.devInfoSection}>
                  <View style={styles.devInfoHeader}>
                    <Ionicons name="code-slash" size={22} color="#f59e0b" />
                    <Text style={styles.devInfoTitle}>Informações do Desenvolvedor</Text>
                  </View>
                  <Text style={styles.devInfoSubtitle}>
                    Dados para configuração no Google Cloud Console
                  </Text>

                  <View>
                    {/* Package Name / Bundle Identifier */}
                    <View style={styles.devInfoItem}>
                      <Text style={styles.devInfoLabel}>Package Name (Android)</Text>
                      <Text style={styles.devInfoValue} selectable={true}>
                        {devInfo?.packageName || 'com.diariodevoz.app'}
                      </Text>
                    </View>

                    <View style={styles.devInfoItem}>
                      <Text style={styles.devInfoLabel}>Bundle Identifier (iOS)</Text>
                      <Text style={styles.devInfoValue} selectable={true}>
                        {devInfo?.bundleId || 'com.diariodevoz.app'}
                      </Text>
                    </View>

                    {/* Project Scheme */}
                    <View style={styles.devInfoItem}>
                      <Text style={styles.devInfoLabel}>URL Scheme</Text>
                      <Text style={styles.devInfoValue} selectable={true}>
                        {devInfo?.scheme || 'com.diariodevoz.app'}
                      </Text>
                    </View>

                    {/* Android SHA-1 */}
                    <View style={styles.devInfoItem}>
                      <Text style={styles.devInfoLabel}>Android SHA-1 Fingerprint (Debug)</Text>
                      <Text style={styles.devInfoValue} selectable={true}>
                        5E:8F:16:06:2E:A3:CD:2C:4A:0D:54:78:76:BA:A6:F3:8C:AB:F6:25
                      </Text>
                      <Text style={styles.devInfoNote}>
                        SHA-1 padrão do Expo Go. Para builds personalizados, execute:{'\n'}
                        keytool -list -v -keystore ~/.android/debug.keystore -alias androiddebugkey -storepass android -keypass android
                      </Text>
                    </View>

                    {/* Google Client IDs */}
                    <View style={styles.devInfoDivider} />
                    <Text style={styles.devInfoSectionTitle}>Google Client IDs em uso</Text>

                    <View style={styles.devInfoItem}>
                      <Text style={styles.devInfoLabel}>Web Client ID</Text>
                      <Text style={styles.devInfoValue} selectable={true} numberOfLines={2}>
                        {GOOGLE_CONFIG.webClientId}
                      </Text>
                    </View>

                    <View style={styles.devInfoItem}>
                      <Text style={styles.devInfoLabel}>Android Client ID</Text>
                      <Text style={styles.devInfoValue} selectable={true} numberOfLines={2}>
                        {GOOGLE_CONFIG.androidClientId}
                      </Text>
                    </View>

                    <View style={styles.devInfoItem}>
                      <Text style={styles.devInfoLabel}>iOS Client ID</Text>
                      <Text style={styles.devInfoValue} selectable={true} numberOfLines={2}>
                        {GOOGLE_CONFIG.iosClientId}
                      </Text>
                    </View>

                    {/* OAuth Scopes */}
                    <View style={styles.devInfoDivider} />
                    <Text style={styles.devInfoSectionTitle}>OAuth Scopes</Text>
                    <View style={styles.devInfoItem}>
                      {GOOGLE_CONFIG.scopes.map((scope, index) => (
                        <Text key={index} style={styles.devInfoScope} selectable={true}>
                          • {scope}
                        </Text>
                      ))}
                    </View>
                  </View>
                </View>
              </>
            )}

            {isAdmin && (
              <>
                <View style={styles.settingsDivider} />
                <TouchableOpacity
                  style={styles.settingsItem}
                  onPress={async () => {
                    await resetDailyChallenges();
                    setShowSettings(false);
                    Alert.alert('Sucesso', 'Seus desafios diários foram resetados para testes!');
                  }}
                >
                  <Ionicons name="refresh-circle-outline" size={22} color="#f59e0b" />
                  <Text style={styles.settingsItemText}>[Debug] Resetar Desafios Hoje</Text>
                  <Ionicons name="chevron-forward" size={18} color="#6b7280" />
                </TouchableOpacity>
              </>
            )}

            <View style={styles.settingsDivider} />

            <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
              <Ionicons name="log-out-outline" size={22} color="#ef4444" />
              <Text style={styles.logoutText}>Sair da conta</Text>
            </TouchableOpacity>
          </ScrollView>

          <View style={styles.settingsFooter}>
            <Text style={styles.footerText}>Diário de Voz v1.0</Text>
            <Text style={styles.footerSubtext}>Suas memórias, sempre seguras</Text>
          </View>
        </View>
      </View>
    </Modal>
  );

  // Modal de erro de sincronização (substitui Alert.alert para funcionar no Web)
  const renderSyncErrorModal = () => (
    <Modal visible={syncErrorModal.visible} transparent animationType="fade">
      <View style={styles.syncErrorOverlay}>
        <View style={styles.syncErrorContent}>
          <View style={styles.syncErrorIconContainer}>
            <Ionicons
              name={syncErrorModal.title.includes('✅') ? 'checkmark-circle' : 'cloud-offline'}
              size={40}
              color={syncErrorModal.title.includes('✅') ? '#10b981' : '#f59e0b'}
            />
          </View>
          <Text style={styles.syncErrorTitle}>{syncErrorModal.title}</Text>
          <Text style={styles.syncErrorMessage}>{syncErrorModal.message}</Text>
          <TouchableOpacity
            style={styles.syncErrorButton}
            onPress={() => setSyncErrorModal({ visible: false, title: '', message: '' })}
          >
            <Text style={styles.syncErrorButtonText}>Entendi</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );

  const getIconName = (icon: string): any => {
    const iconMap: Record<string, string> = {
      brain: 'bulb-outline',
      heart: 'heart-outline',
      scale: 'git-compare-outline',
      flame: 'flame-outline',
      diamond: 'diamond-outline',
      people: 'people-outline',
      fitness: 'fitness-outline',
      leaf: 'leaf-outline',
    };
    return iconMap[icon] || 'help-outline';
  };

  const renderChallengeModal = () => {
    return (
      <Modal visible={showChallengeModal} animationType="slide" transparent onRequestClose={() => setShowChallengeModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.challengeModalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {showChallengeHistory ? "Histórico de Desafios" : "Desafios de Hoje"}
              </Text>
              <TouchableOpacity onPress={() => setShowChallengeModal(false)}>
                <Ionicons name="close" size={24} color="#9ca3af" />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.challengeList} showsVerticalScrollIndicator={false}>
              {showChallengeHistory ? (
                <>
                  <View style={styles.challengeItemCompleted}>
                    <Text style={styles.challengeEmoji}>🚀</Text>
                    <View style={styles.challengeTexts}>
                      <Text style={styles.challengeItemTitle}>O que te motiva hoje?</Text>
                      <Text style={styles.challengeDate}>Concluído Ontem</Text>
                    </View>
                    <Ionicons name="checkmark-circle" size={20} color="#10b981" />
                  </View>
                  <View style={styles.challengeItemCompleted}>
                    <Text style={styles.challengeEmoji}>🌟</Text>
                    <View style={styles.challengeTexts}>
                      <Text style={styles.challengeItemTitle}>Qual sua maior conquista recente?</Text>
                      <Text style={styles.challengeDate}>Concluído há 2 dias</Text>
                    </View>
                    <Ionicons name="checkmark-circle" size={20} color="#10b981" />
                  </View>
                  <View style={styles.challengeItemCompleted}>
                    <Text style={styles.challengeEmoji}>😌</Text>
                    <View style={styles.challengeTexts}>
                      <Text style={styles.challengeItemTitle}>Fale de um momento de paz.</Text>
                      <Text style={styles.challengeDate}>Concluído há 5 dias</Text>
                    </View>
                    <Ionicons name="checkmark-circle" size={20} color="#10b981" />
                  </View>
                </>
              ) : (
                <>
                  <View style={styles.challengeItem}>
                    <Text style={styles.challengeEmoji}>🧭</Text>
                    <View style={styles.challengeTexts}>
                      <Text style={styles.challengeItemTitle}>Qual emoção tem te visitado mais?</Text>
                      <Text style={styles.challengeDate}>Pendente</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={20} color="#6b7280" />
                  </View>
                  <View style={styles.challengeItem}>
                    <Text style={styles.challengeEmoji}>🪞</Text>
                    <View style={styles.challengeTexts}>
                      <Text style={styles.challengeItemTitle}>O que você aprendeu sobre si?</Text>
                      <Text style={styles.challengeDate}>Pendente</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={20} color="#6b7280" />
                  </View>
                  <View style={styles.challengeItem}>
                    <Text style={styles.challengeEmoji}>✨</Text>
                    <View style={styles.challengeTexts}>
                      <Text style={styles.challengeItemTitle}>O que te fez sorrir hoje?</Text>
                      <Text style={styles.challengeDate}>Pendente</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={20} color="#6b7280" />
                  </View>
                </>
              )}
            </ScrollView>

            <TouchableOpacity
              style={styles.historyToggleButton}
              onPress={() => setShowChallengeHistory(!showChallengeHistory)}
            >
              <Ionicons name={showChallengeHistory ? "today-outline" : "time-outline"} size={20} color="#8b5cf6" />
              <Text style={styles.historyToggleText}>
                {showChallengeHistory ? "Ver Desafios de Hoje" : "Ver Histórico de Concluídos"}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    );
  };

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#8b5cf6" />
          <Text style={styles.loadingText}>Construindo seu perfil...</Text>
          <Text style={styles.loadingSubtext}>Analisando suas memórias com carinho</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <Animated.View style={[styles.content, { opacity: fadeAnim }]}>
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={onPullRefresh}
              tintColor="#8b5cf6"
            />
          }
          showsVerticalScrollIndicator={false}
        >
          {/* Header was moved to AvatarWidget */}

          {profile && profile.memory_count < 3 ? (
            <View style={styles.emptyState}>
              <Ionicons name="sparkles-outline" size={64} color="#4b5563" />
              <Text style={styles.emptyTitle}>Vamos nos conhecer</Text>
              <Text style={styles.emptyText}>
                Grave mais algumas memórias para que{'\n'}possamos entender quem você é.
              </Text>
              <Text style={styles.emptyCount}>
                {profile.memory_count}/3 memórias para começar
              </Text>
              <TouchableOpacity
                style={styles.recordButton}
                onPress={() => router.push('/')}
              >
                <Ionicons name="mic" size={20} color="#fff" />
                <Text style={styles.recordButtonText}>Gravar memória</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <>
              <AvatarWidget
                emotionColor={profile?.dimensions?.[0]?.color || '#8b5cf6'}
                emotionName={profile?.dominantEmotion || 'feliz'}
                onPressChallenge={() => {
                  setShowChallengeHistory(false);
                  setShowChallengeModal(true);
                }}
                onPressSettings={() => setShowSettings(true)}
              />
              {renderSummary()}
              {renderDimensions()}
              {renderEvolution()}
              {renderReflections()}
              {renderRefreshButton()}
            </>
          )}
        </ScrollView>
      </Animated.View>

      {renderChallengeModal()}
      {renderDimensionModal()}
      {renderSettingsModal()}
      {renderSyncErrorModal()}
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
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
  },
  loadingSubtext: {
    marginTop: 4,
    fontSize: 14,
    color: '#6b7280',
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
  header: {
    alignItems: 'center',
    paddingTop: 16,
    paddingBottom: 24,
  },
  headerTop: {
    flexDirection: 'row',
    width: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  avatarContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#8b5cf6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#fff',
  },
  settingsButton: {
    padding: 8,
  },
  headerButtons: {
    position: 'absolute',
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  logoutHeaderButton: {
    padding: 8,
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    borderRadius: 8,
  },
  userName: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
  },
  levelBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    marginTop: 8,
    gap: 6,
  },
  levelText: {
    fontSize: 12,
    fontWeight: '600',
  },
  memoryCount: {
    fontSize: 13,
    color: '#6b7280',
    marginTop: 8,
  },
  summarySection: {
    backgroundColor: '#1a1a24',
    borderRadius: 16,
    padding: 20,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: '#2d2d3a',
  },
  summaryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  sectionSubtitle: {
    fontSize: 13,
    color: '#6b7280',
    marginBottom: 16,
    marginTop: 4,
  },
  summaryText: {
    fontSize: 15,
    color: '#d1d5db',
    lineHeight: 24,
  },
  dimensionsSection: {
    marginBottom: 24,
  },
  dimensionCard: {
    backgroundColor: '#1a1a24',
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#2d2d3a',
    borderLeftWidth: 3,
  },
  dimensionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  dimensionIconContainer: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  dimensionTitleContainer: {
    flex: 1,
  },
  dimensionTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#fff',
  },
  confidenceBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
    gap: 4,
  },
  confidenceDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  confidenceText: {
    fontSize: 11,
  },
  dimensionInsight: {
    fontSize: 14,
    color: '#e5e7eb',
    lineHeight: 20,
  },
  dimensionDetails: {
    fontSize: 13,
    color: '#9ca3af',
    marginTop: 8,
    lineHeight: 18,
  },
  expandedContent: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#2d2d3a',
  },
  viewMoreButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: 'rgba(139, 92, 246, 0.1)',
    borderRadius: 8,
    gap: 6,
  },
  viewMoreText: {
    fontSize: 13,
    fontWeight: '500',
  },
  evolutionSection: {
    marginBottom: 24,
  },
  evolutionCard: {
    flexDirection: 'row',
    marginBottom: 16,
  },
  evolutionDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#8b5cf6',
    marginRight: 12,
    marginTop: 4,
  },
  evolutionContent: {
    flex: 1,
    backgroundColor: '#1a1a24',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#2d2d3a',
  },
  evolutionLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#8b5cf6',
    marginBottom: 4,
  },
  evolutionSummary: {
    fontSize: 14,
    color: '#d1d5db',
    lineHeight: 20,
  },
  evolutionChanges: {
    marginTop: 10,
    gap: 6,
  },
  changeItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  changeText: {
    fontSize: 13,
    color: '#9ca3af',
  },
  reflectionsSection: {
    marginBottom: 24,
  },
  reflectionCard: {
    backgroundColor: '#1a1a24',
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#2d2d3a',
  },
  reflectionIcon: {
    marginBottom: 10,
  },
  reflectionQuestion: {
    fontSize: 15,
    color: '#e5e7eb',
    lineHeight: 22,
    fontStyle: 'italic',
  },
  reflectionContext: {
    fontSize: 13,
    color: '#6b7280',
    marginTop: 8,
  },
  refreshButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(139, 92, 246, 0.1)',
    paddingVertical: 14,
    borderRadius: 12,
    gap: 8,
    marginBottom: 20,
  },
  refreshButtonText: {
    color: '#8b5cf6',
    fontSize: 15,
    fontWeight: '500',
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 60,
    paddingHorizontal: 20,
  },
  emptyTitle: {
    fontSize: 22,
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
  emptyCount: {
    fontSize: 14,
    color: '#8b5cf6',
    marginTop: 16,
    fontWeight: '500',
  },
  recordButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#8b5cf6',
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 12,
    marginTop: 24,
    gap: 8,
  },
  recordButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#12121a',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    maxHeight: '80%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  modalIcon: {
    width: 56,
    height: 56,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalClose: {
    padding: 4,
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 8,
  },
  modalInsight: {
    fontSize: 16,
    color: '#e5e7eb',
    lineHeight: 24,
    marginBottom: 20,
  },
  modalDetailsSection: {
    marginBottom: 20,
  },
  modalSectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#8b5cf6',
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  modalDetails: {
    fontSize: 14,
    color: '#9ca3af',
    lineHeight: 22,
  },
  modalExamplesSection: {
    marginBottom: 20,
  },
  exampleCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#1a1a24',
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
    gap: 10,
  },
  exampleText: {
    flex: 1,
    fontSize: 13,
    color: '#d1d5db',
    fontStyle: 'italic',
    lineHeight: 18,
  },
  confidenceSection: {
    marginTop: 10,
  },
  confidenceLabel: {
    fontSize: 13,
    color: '#6b7280',
    marginBottom: 8,
  },
  confidenceBar: {
    height: 6,
    backgroundColor: '#2d2d3a',
    borderRadius: 3,
    overflow: 'hidden',
  },
  confidenceFill: {
    height: '100%',
    borderRadius: 3,
  },
  // Settings Modal
  settingsModal: {
    backgroundColor: '#12121a',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 20,
    maxHeight: '85%',
  },
  settingsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#2d2d3a',
  },
  settingsTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
  },
  settingsContent: {
    paddingHorizontal: 24,
    paddingVertical: 20,
    flexGrow: 1,
  },
  userInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    paddingVertical: 8,
  },
  settingsAvatarContainer: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#8b5cf6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  settingsAvatarText: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
  },
  userDetails: {
    flex: 1,
  },
  settingsUserName: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
  },
  settingsUserEmail: {
    fontSize: 14,
    color: '#9ca3af',
    marginTop: 2,
  },
  settingsDivider: {
    height: 1,
    backgroundColor: '#2d2d3a',
    marginVertical: 16,
  },
  settingsItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    gap: 14,
  },
  settingsItemText: {
    flex: 1,
    fontSize: 16,
    color: '#e5e7eb',
  },
  settingsItemNoBorder: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 12,
  },
  themeSection: {
    marginBottom: 16,
  },
  themeOptionsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
    marginTop: 8,
  },
  themeOption: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1a1a24',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#2d2d3a',
    gap: 6,
  },
  themeOptionActive: {
    backgroundColor: 'rgba(139, 92, 246, 0.1)',
    borderColor: '#8b5cf6',
  },
  themeOptionText: {
    fontSize: 13,
    color: '#9ca3af',
    fontWeight: '500',
  },
  themeOptionTextActive: {
    color: '#8b5cf6',
  },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    gap: 14,
  },
  logoutText: {
    fontSize: 16,
    color: '#ef4444',
    fontWeight: '500',
  },
  settingsFooter: {
    alignItems: 'center',
    paddingVertical: 20,
    borderTopWidth: 1,
    borderTopColor: '#2d2d3a',
  },
  footerText: {
    fontSize: 14,
    color: '#6b7280',
  },
  footerSubtext: {
    fontSize: 12,
    color: '#4b5563',
    marginTop: 4,
  },
  // Sync section styles
  syncSection: {
    backgroundColor: '#1a1a24',
    borderRadius: 12,
    padding: 16,
    marginVertical: 8,
  },
  syncHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 8,
  },
  syncTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  syncDescription: {
    fontSize: 13,
    color: '#9ca3af',
    marginBottom: 8,
  },
  syncLastSync: {
    fontSize: 12,
    color: '#6b7280',
    marginBottom: 4,
  },
  syncPending: {
    fontSize: 12,
    color: '#eab308',
    marginBottom: 8,
  },
  syncButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#4285F4',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 10,
    marginTop: 8,
    gap: 8,
  },
  syncButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },
  // Developer Info Section Styles
  devInfoSection: {
    backgroundColor: '#1a1a24',
    borderRadius: 12,
    padding: 16,
    marginVertical: 8,
    borderWidth: 1,
    borderColor: '#f59e0b30',
  },
  devInfoHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 4,
  },
  devInfoTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#f59e0b',
  },
  devInfoSubtitle: {
    fontSize: 12,
    color: '#6b7280',
    marginBottom: 12,
  },
  devInfoScrollView: {
    maxHeight: 300,
  },
  devInfoItem: {
    marginBottom: 12,
  },
  devInfoLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#9ca3af',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  devInfoValue: {
    fontSize: 13,
    color: '#e5e7eb',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    backgroundColor: '#0d0d12',
    padding: 8,
    borderRadius: 6,
  },
  devInfoNote: {
    fontSize: 10,
    color: '#6b7280',
    marginTop: 4,
    fontStyle: 'italic',
  },
  devInfoDivider: {
    height: 1,
    backgroundColor: '#2d2d3a',
    marginVertical: 12,
  },
  devInfoSectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#8b5cf6',
    marginBottom: 8,
  },
  devInfoScope: {
    fontSize: 11,
    color: '#9ca3af',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    marginBottom: 2,
  },
  // Estilos do modal de erro de sincronização
  syncErrorOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  syncErrorContent: {
    backgroundColor: '#1a1a24',
    borderRadius: 20,
    padding: 24,
    width: '100%',
    maxWidth: 360,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#2d2d3a',
  },
  syncErrorIconContainer: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: 'rgba(245, 158, 11, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  syncErrorTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#ef4444',
    marginBottom: 12,
  },
  syncErrorMessage: {
    fontSize: 16,
    color: '#d1d5db',
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 24,
  },
  syncErrorButton: {
    backgroundColor: '#374151',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
    width: '100%',
    alignItems: 'center',
  },
  syncErrorButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  // Challenge Modal Styles
  challengeModalContent: {
    backgroundColor: '#1a1a24',
    borderRadius: 24,
    padding: 24,
    maxHeight: '80%',
    width: '100%',
  },
  challengeList: {
    marginTop: 10,
    marginBottom: 20,
  },
  challengeItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#2d2d3a',
    padding: 16,
    borderRadius: 16,
    marginBottom: 12,
  },
  challengeItemCompleted: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
    borderColor: 'rgba(16, 185, 129, 0.3)',
    borderWidth: 1,
    padding: 16,
    borderRadius: 16,
    marginBottom: 12,
  },
  challengeEmoji: {
    fontSize: 28,
    marginRight: 16,
  },
  challengeTexts: {
    flex: 1,
  },
  challengeItemTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#f3f4f6',
    marginBottom: 4,
  },
  challengeDate: {
    fontSize: 12,
    color: '#9ca3af',
  },
  historyToggleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    backgroundColor: 'rgba(139, 92, 246, 0.1)',
    borderRadius: 12,
    gap: 8,
  },
  historyToggleText: {
    fontSize: 15,
    color: '#8b5cf6',
    fontWeight: '600',
  },
});
