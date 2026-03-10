import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Modal,
  ScrollView,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../src/contexts/AuthContext';
import { localStorage, LocalMemory } from '../../src/services/LocalStorage';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { format, isToday, isYesterday, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface Memory {
  id: string;
  transcription: string;
  emotion: string;
  emotion_emoji: string;
  mood_score: number;
  duration_seconds: number | null;
  detected_date: string | null;
  memory_date: string | null;
  created_at: string;
  updated_at: string | null;
  photo_url?: string;
  mentioned_connections?: string[];
}

type SortBy = 'created_at' | 'updated_at' | 'memory_date';
type SortOrder = 'desc' | 'asc';

const SORT_OPTIONS = [
  { value: 'created_at', label: 'Data de criação' },
  { value: 'updated_at', label: 'Última modificação' },
  { value: 'memory_date', label: 'Data do evento' },
];

export default function MemoriesScreen() {
  const { user } = useAuth();
  const { emotion: filterEmotion, search: searchParam, title: titleParam } = useLocalSearchParams<{ emotion?: string; search?: string; title?: string }>();
  const [memories, setMemories] = useState<Memory[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showSortModal, setShowSortModal] = useState(false);
  const [sortBy, setSortBy] = useState<SortBy>('created_at');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
  const [activeTab, setActiveTab] = useState<'recent' | 'journey' | 'gallery'>('recent');
  const [connectionsMap, setConnectionsMap] = useState<Record<string, string>>({});

  const scrollViewRef = useRef<any>(null);
  const [groupPositions, setGroupPositions] = useState<Record<string, number>>({});

  const fetchMemories = useCallback(async () => {
    try {
      // Get memories from local storage
      const localMemories = await localStorage.getMemories();
      const localConnections = await localStorage.getConnections();

      const connMap: Record<string, string> = {};
      localConnections.forEach(c => {
        connMap[c.id] = c.name;
      });
      setConnectionsMap(connMap);

      // Transform to Memory interface with safe defaults
      let transformed: Memory[] = localMemories
        .filter(m => m && m.id) // Filter out invalid entries
        .map(m => ({
          id: m.id,
          transcription: m.transcription || '',
          emotion: m.emotion || 'neutro',
          emotion_emoji: m.emotionEmoji || '😐',
          mood_score: m.moodScore || 5,
          duration_seconds: m.durationSeconds || null,
          detected_date: null,
          memory_date: m.memoryDate || null,
          created_at: m.createdAt || new Date().toISOString(),
          updated_at: m.updatedAt || null,
          photo_url: m.photoUrl || undefined,
          mentioned_connections: m.mentionedConnections || [],
        }));

      // Filter by emotion if specified
      if (filterEmotion) {
        transformed = transformed.filter(m =>
          m.emotion.toLowerCase() === filterEmotion.toLowerCase()
        );
      }

      // Filter by search text if specified (checking life areas/transcription)
      if (searchParam) {
        const LIFE_AREA_KEYWORDS: { [key: string]: string[] } = {
          work: ["trabalho", "emprego", "escritório", "chefe", "reunião", "projeto", "deadline", "carreira", "promoção", "empresa", "cliente", "profissional"],
          relationships: ["amor", "namorado", "namorada", "esposo", "esposa", "família", "mãe", "pai", "filho", "filha", "casamento", "parceiro"],
          health: ["saúde", "academia", "exercício", "treino", "médico", "energia", "cansaço", "sono", "alimentação", "bem-estar"],
          finances: ["dinheiro", "conta", "banco", "investimento", "economia", "gasto", "salário", "dívida", "compra"],
          social: ["amigo", "amiga", "festa", "encontro", "sair", "balada", "bar", "restaurante", "grupo", "turma"],
          leisure: ["descanso", "relaxar", "hobby", "filme", "série", "música", "livro", "natureza", "viagem", "férias", "igreja", "oração", "meditação"]
        };

        const isLifeArea = Object.keys(LIFE_AREA_KEYWORDS).includes(searchParam);

        if (isLifeArea) {
          const keywords = LIFE_AREA_KEYWORDS[searchParam];
          transformed = transformed.filter(m => {
            const lowerTrans = m.transcription.toLowerCase();
            return keywords.some(kw => lowerTrans.includes(kw));
          });
        } else {
          const searchLower = searchParam.toLowerCase();
          transformed = transformed.filter(m =>
            m.transcription.toLowerCase().includes(searchLower) ||
            m.emotion.toLowerCase().includes(searchLower)
          );
        }
      }

      // Sort memories
      const sorted = transformed.sort((a, b) => {
        let dateA: Date, dateB: Date;

        if (sortBy === 'memory_date') {
          dateA = a.memory_date ? parseISO(a.memory_date) : parseISO(a.created_at);
          dateB = b.memory_date ? parseISO(b.memory_date) : parseISO(b.created_at);
        } else if (sortBy === 'updated_at') {
          dateA = a.updated_at ? parseISO(a.updated_at) : parseISO(a.created_at);
          dateB = b.updated_at ? parseISO(b.updated_at) : parseISO(b.created_at);
        } else {
          dateA = parseISO(a.created_at);
          dateB = parseISO(b.created_at);
        }

        return sortOrder === 'desc'
          ? dateB.getTime() - dateA.getTime()
          : dateA.getTime() - dateB.getTime();
      });

      setMemories(sorted);
    } catch (error) {
      console.error('Error fetching memories:', error);
      setMemories([]); // Reset to empty on error
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [sortBy, sortOrder, filterEmotion, searchParam]);

  // Refresh when screen gets focus
  useFocusEffect(
    useCallback(() => {
      fetchMemories();
    }, [fetchMemories])
  );

  useEffect(() => {
    fetchMemories();
  }, [sortBy, sortOrder, filterEmotion, searchParam]);

  const clearFilter = () => {
    router.setParams({ emotion: undefined, search: undefined, title: undefined });
  };

  const onRefresh = () => {
    setIsRefreshing(true);
    fetchMemories();
  };

  const formatDate = (dateString: string) => {
    const date = parseISO(dateString);
    if (isToday(date)) return 'Hoje';
    if (isYesterday(date)) return 'Ontem';
    return format(date, "d 'de' MMMM", { locale: ptBR });
  };

  const formatTime = (dateString: string) => {
    return format(parseISO(dateString), 'HH:mm');
  };

  const getDisplayDate = (memory: Memory) => {
    if (sortBy === 'memory_date' && memory.memory_date) {
      return memory.memory_date;
    }
    if (sortBy === 'updated_at' && memory.updated_at) {
      return memory.updated_at;
    }
    return memory.created_at;
  };

  const handleSortChange = (newSortBy: SortBy) => {
    setSortBy(newSortBy);
    setShowSortModal(false);
    setIsLoading(true);
  };

  const toggleSortOrder = () => {
    setSortOrder(prev => prev === 'desc' ? 'asc' : 'desc');
    setIsLoading(true);
  };

  const renderMemory = ({ item, index }: { item: Memory; index: number }) => {
    const displayDate = getDisplayDate(item);
    const showDateHeader = index === 0 ||
      formatDate(displayDate) !== formatDate(getDisplayDate(memories[index - 1]));

    // Safe date formatting for memory_date
    const formatMemoryDate = (dateStr: string | null) => {
      if (!dateStr) return null;
      try {
        // Check if it's a valid ISO date
        const date = parseISO(dateStr);
        if (isNaN(date.getTime())) return dateStr; // Return as-is if invalid
        return format(date, 'd/MM', { locale: ptBR });
      } catch {
        return dateStr; // Return as-is if parsing fails
      }
    };

    return (
      <>
        {showDateHeader && (
          <View style={styles.dateHeader}>
            <Text style={styles.dateHeaderText}>{formatDate(displayDate)}</Text>
          </View>
        )}
        <TouchableOpacity
          style={styles.memoryCard}
          onPress={() => router.push(`/memory/${item.id}`)}
          activeOpacity={0.7}
        >
          <View style={styles.memoryHeader}>
            <View style={styles.emotionBadge}>
              <Text style={styles.emotionEmoji}>{item.emotion_emoji}</Text>
              <Text style={styles.emotionText}>{item.emotion}</Text>
            </View>
            <Text style={styles.timeText}>{formatTime(item.created_at)}</Text>
          </View>

          <Text style={styles.transcriptionText} numberOfLines={3}>
            {item.transcription}
          </Text>

          {item.mentioned_connections && item.mentioned_connections.length > 0 && (
            <View style={styles.tagsContainer}>
              {item.mentioned_connections.map(connId => (
                <View key={connId} style={styles.connectionTag}>
                  <Ionicons name="person-circle-outline" size={14} color="#a78bfa" />
                  <Text style={styles.connectionTagText}>
                    {connectionsMap[connId] || 'Conexão'}
                  </Text>
                </View>
              ))}
            </View>
          )}

          <View style={styles.memoryFooter}>
            <View style={styles.moodBar}>
              <View
                style={[
                  styles.moodFill,
                  { width: `${item.mood_score * 10}%` },
                  item.mood_score >= 7 && styles.moodPositive,
                  item.mood_score <= 3 && styles.moodNegative,
                ]}
              />
            </View>
            <View style={styles.footerInfo}>
              {item.duration_seconds && (
                <View style={styles.footerItem}>
                  <Ionicons name="mic-outline" size={12} color="#6b7280" />
                  <Text style={styles.footerItemText}>
                    {Math.floor(item.duration_seconds / 60)}:{(item.duration_seconds % 60).toString().padStart(2, '0')}
                  </Text>
                </View>
              )}
              {item.memory_date && (
                <View style={styles.footerItem}>
                  <Ionicons name="calendar-outline" size={12} color="#8b5cf6" />
                  <Text style={[styles.footerItemText, { color: '#8b5cf6' }]}>
                    Evento: {formatMemoryDate(item.memory_date)}
                  </Text>
                </View>
              )}
            </View>
          </View>
        </TouchableOpacity>
      </>
    );
  };

  const renderJourney = () => {
    // Sort memories chronologically (oldest to newest) for Journey view
    const chronologicalMemories = [...memories].sort((a, b) => {
      const dateA = a.memory_date ? parseISO(a.memory_date) : parseISO(a.created_at);
      const dateB = b.memory_date ? parseISO(b.memory_date) : parseISO(b.created_at);
      return dateA.getTime() - dateB.getTime();
    });

    // Agrupar por Mês/Ano
    const groups: { title: string; items: Memory[] }[] = [];
    const tempGroups: Record<string, Memory[]> = {};

    chronologicalMemories.forEach(m => {
      const dateStr = m.memory_date ? m.memory_date : m.created_at;
      let date = parseISO(dateStr);
      if (isNaN(date.getTime())) date = parseISO(m.created_at); // Fallback if memory_date is invalid

      const key = format(date, "MMMM 'de' yyyy", { locale: ptBR });
      if (!tempGroups[key]) tempGroups[key] = [];
      tempGroups[key].push(m);
    });

    Object.keys(tempGroups).forEach(key => {
      groups.push({ title: key, items: tempGroups[key] });
    });

    return (
      <View style={styles.journeyContainer}>
        {groups.map((group, groupIndex) => (
          <View
            key={groupIndex}
            style={styles.journeyGroup}
            onLayout={(e) => {
              const y = e.nativeEvent.layout.y;
              setGroupPositions(prev => ({ ...prev, [group.title]: y }));
            }}
          >
            <View style={styles.journeyGroupHeader}>
              <View style={styles.journeyDot} />
              <Text style={styles.journeyTitle}>{group.title}</Text>
            </View>

            <View style={styles.journeyLineContainer}>
              <View style={styles.journeyLine} />
              <View style={styles.journeyItems}>
                {group.items.map((item, index) => (
                  <TouchableOpacity
                    key={item.id}
                    style={styles.journeyCard}
                    onPress={() => router.push(`/memory/${item.id}`)}
                    activeOpacity={0.7}
                  >
                    <View style={styles.journeyCardHeader}>
                      <Text style={styles.journeyEmoji}>{item.emotion_emoji}</Text>
                      <Text style={styles.journeyTime}>{formatTime(item.created_at)}</Text>
                    </View>
                    <Text style={styles.journeyTranscription} numberOfLines={2}>
                      {item.transcription}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          </View>
        ))}
        {groups.length === 0 && (
          <Text style={styles.emptyText}>Sem jornada para mostrar.</Text>
        )}
      </View>
    );
  };

  const renderGallery = () => {
    const memoryWithPhotos = memories.filter((m: Memory) => m.photo_url);

    if (memoryWithPhotos.length === 0) {
      return (
        <View style={styles.emptyContainer}>
          <Ionicons name="images-outline" size={64} color="#4b5563" />
          <Text style={styles.emptyTitle}>Sua galeria está vazia</Text>
          <Text style={styles.emptyText}>
            Abra uma memória e toque em &quot;Anexar foto&quot; para criar seu álbum de memórias.
          </Text>
        </View>
      );
    }

    return (
      <View style={styles.galleryGrid}>
        {memoryWithPhotos.map((item: Memory) => (
          <TouchableOpacity
            key={item.id}
            style={styles.galleryItem}
            onPress={() => router.push(`/memory/${item.id}`)}
            activeOpacity={0.8}
          >
            <Image source={{ uri: item.photo_url }} style={styles.galleryImage} />
            <View style={styles.galleryOverlay}>
              <Text style={styles.galleryEmoji}>{item.emotion_emoji}</Text>
              <Text style={styles.galleryDate}>
                {item.memory_date ? formatMemoryDate(item.memory_date) : format(parseISO(item.created_at), 'dd/MM/yyyy')}
              </Text>
            </View>
          </TouchableOpacity>
        ))}
      </View>
    );
  };

  // Safe date formatting handler moved outside to be used globally
  const formatMemoryDate = (dateStr: string | null) => {
    if (!dateStr) return null;
    try {
      const date = parseISO(dateStr);
      if (isNaN(date.getTime())) return dateStr;
      return format(date, 'd/MM', { locale: ptBR });
    } catch {
      return dateStr;
    }
  };

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container} edges={[]}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#8b5cf6" />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={[]}>
      {/* Search Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>
            {filterEmotion ? `Memórias: ${filterEmotion}` : searchParam ? `Memórias: ${titleParam || searchParam}` : 'Minhas Memórias'}
          </Text>
          <Text style={styles.subtitle}>{memories.length} registros</Text>
        </View>

        {/* Sort controls */}
        <View style={styles.sortControls}>
          {(filterEmotion || searchParam) && (
            <TouchableOpacity
              style={styles.clearFilterButton}
              onPress={clearFilter}
            >
              <Ionicons name="close-circle" size={18} color="#ef4444" />
              <Text style={styles.clearFilterText}>Limpar</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={styles.sortButton}
            onPress={() => setShowSortModal(true)}
          >
            <Ionicons name="funnel-outline" size={18} color="#8b5cf6" />
            <Text style={styles.sortButtonText}>
              {SORT_OPTIONS.find(o => o.value === sortBy)?.label}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.orderButton}
            onPress={toggleSortOrder}
          >
            <Ionicons
              name={sortOrder === 'desc' ? 'arrow-down' : 'arrow-up'}
              size={18}
              color="#8b5cf6"
            />
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.subTabsContainer}>
        <TouchableOpacity
          style={[styles.subTab, activeTab === 'recent' && styles.subTabActive]}
          onPress={() => setActiveTab('recent')}
        >
          <Text style={[styles.subTabText, activeTab === 'recent' && styles.subTabTextActive]}>Recentes</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.subTab, activeTab === 'journey' && styles.subTabActive]}
          onPress={() => setActiveTab('journey')}
        >
          <Text style={[styles.subTabText, activeTab === 'journey' && styles.subTabTextActive]}>Jornada</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.subTab, activeTab === 'gallery' && styles.subTabActive]}
          onPress={() => setActiveTab('gallery')}
        >
          <Text style={[styles.subTabText, activeTab === 'gallery' && styles.subTabTextActive]}>Galeria</Text>
        </TouchableOpacity>
      </View>

      {memories.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="book-outline" size={64} color="#4b5563" />
          <Text style={styles.emptyTitle}>
            {filterEmotion ? `Nenhuma memória "${filterEmotion}"` : 'Nenhuma memória ainda'}
          </Text>
          <Text style={styles.emptyText}>
            {filterEmotion
              ? 'Tente limpar o filtro para ver todas as memórias'
              : 'Comece a gravar suas memórias\ne elas aparecerão aqui'
            }
          </Text>
          {filterEmotion ? (
            <TouchableOpacity
              style={styles.recordButton}
              onPress={clearFilter}
            >
              <Ionicons name="refresh" size={20} color="#fff" />
              <Text style={styles.recordButtonText}>Ver todas</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={styles.recordButton}
              onPress={() => router.push('/(tabs)')}
            >
              <Ionicons name="mic" size={20} color="#fff" />
              <Text style={styles.recordButtonText}>Gravar agora</Text>
            </TouchableOpacity>
          )}
        </View>
      ) : activeTab === 'recent' ? (
        <FlatList
          data={memories}
          renderItem={renderMemory}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={onRefresh}
              tintColor="#8b5cf6"
              colors={['#8b5cf6']}
            />
          }
          showsVerticalScrollIndicator={false}
        />
      ) : activeTab === 'journey' ? (
        <View style={{ flex: 1, position: 'relative' }}>
          <ScrollView
            ref={scrollViewRef}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl
                refreshing={isRefreshing}
                onRefresh={onRefresh}
                tintColor="#8b5cf6"
              />
            }
          >
            {renderJourney()}
          </ScrollView>

          {/* Scroll Index Sidebar */}
          {Object.keys(groupPositions).length > 2 && (
            <View style={styles.timelineIndex}>
              {Object.keys(groupPositions).map((title, index) => {
                const parts = title.split(' ');
                const label = parts.length >= 3 ? `${parts[0].substring(0, 3)} ${parts[2].slice(-2)}` : title.substring(0, 4);
                return (
                  <TouchableOpacity
                    key={index}
                    style={styles.timelineIndexItem}
                    onPress={() => scrollViewRef.current?.scrollTo({ y: groupPositions[title], animated: true })}
                    activeOpacity={0.7}
                  >
                    <View style={styles.timelineIndexDot} />
                    <Text style={styles.timelineIndexText}>{label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={onRefresh}
              tintColor="#8b5cf6"
            />
          }
        >
          {renderGallery()}
        </ScrollView>
      )}

      {/* Sort Modal */}
      <Modal visible={showSortModal} transparent animationType="fade">
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setShowSortModal(false)}
        >
          <View style={styles.sortModal}>
            <Text style={styles.sortModalTitle}>Ordenar por</Text>
            {SORT_OPTIONS.map((option) => (
              <TouchableOpacity
                key={option.value}
                style={[
                  styles.sortOption,
                  sortBy === option.value && styles.sortOptionActive
                ]}
                onPress={() => handleSortChange(option.value as SortBy)}
              >
                <Text style={[
                  styles.sortOptionText,
                  sortBy === option.value && styles.sortOptionTextActive
                ]}>
                  {option.label}
                </Text>
                {sortBy === option.value && (
                  <Ionicons name="checkmark" size={20} color="#8b5cf6" />
                )}
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
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
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 12,
  },
  title: {
    fontSize: 26,
    fontWeight: 'bold',
    color: '#fff',
  },
  subtitle: {
    fontSize: 14,
    color: '#6b7280',
    marginTop: 2,
  },
  sortControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 12,
    flexWrap: 'wrap',
  },
  clearFilterButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 20,
  },
  clearFilterText: {
    fontSize: 12,
    color: '#ef4444',
    fontWeight: '500',
  },
  sortButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(139, 92, 246, 0.1)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
  },
  sortButtonText: {
    fontSize: 13,
    color: '#8b5cf6',
    fontWeight: '500',
  },
  orderButton: {
    backgroundColor: 'rgba(139, 92, 246, 0.1)',
    padding: 8,
    borderRadius: 20,
  },
  subTabsContainer: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    marginBottom: 10,
    gap: 12,
  },
  subTab: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
    backgroundColor: '#1a1a24',
    borderWidth: 1,
    borderColor: '#2d2d3a',
  },
  subTabActive: {
    backgroundColor: '#8b5cf6',
    borderColor: '#8b5cf6',
  },
  subTabText: {
    color: '#9ca3af',
    fontSize: 14,
    fontWeight: '600',
  },
  subTabTextActive: {
    color: '#fff',
  },
  listContent: {
    paddingHorizontal: 20,
    paddingBottom: 24,
  },
  dateHeader: {
    marginTop: 20,
    marginBottom: 10,
  },
  dateHeaderText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#6b7280',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  memoryCard: {
    backgroundColor: '#1a1a24',
    borderRadius: 16,
    padding: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#2d2d3a',
  },
  memoryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  emotionBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(139, 92, 246, 0.12)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 16,
    gap: 5,
  },
  emotionEmoji: {
    fontSize: 14,
  },
  emotionText: {
    fontSize: 13,
    color: '#8b5cf6',
    fontWeight: '500',
    textTransform: 'capitalize',
  },
  timeText: {
    fontSize: 13,
    color: '#6b7280',
  },
  transcriptionText: {
    fontSize: 15,
    color: '#d1d5db',
    lineHeight: 22,
  },
  tagsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 8,
  },
  connectionTag: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(167, 139, 250, 0.1)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 4,
    borderWidth: 1,
    borderColor: 'rgba(167, 139, 250, 0.2)',
  },
  connectionTagText: {
    color: '#a78bfa',
    fontSize: 12,
    fontWeight: '500',
  },
  memoryFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 12,
  },
  moodBar: {
    flex: 1,
    height: 4,
    backgroundColor: '#2d2d3a',
    borderRadius: 2,
    marginRight: 12,
    overflow: 'hidden',
  },
  moodFill: {
    height: '100%',
    backgroundColor: '#8b5cf6',
    borderRadius: 2,
  },
  moodPositive: {
    backgroundColor: '#10b981',
  },
  moodNegative: {
    backgroundColor: '#ef4444',
  },
  footerInfo: {
    flexDirection: 'row',
    gap: 12,
  },
  footerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  footerItemText: {
    fontSize: 12,
    color: '#6b7280',
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
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
    color: '#9ca3af',
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 22,
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
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  sortModal: {
    backgroundColor: '#1a1a24',
    borderRadius: 16,
    padding: 20,
    width: '80%',
    maxWidth: 300,
  },
  sortModalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 16,
  },
  sortOption: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#2d2d3a',
  },
  sortOptionActive: {
    borderBottomColor: '#8b5cf6',
  },
  sortOptionText: {
    fontSize: 15,
    color: '#9ca3af',
  },
  sortOptionTextActive: {
    color: '#8b5cf6',
    fontWeight: '600',
  },
  journeyContainer: {
    paddingTop: 10,
    paddingBottom: 40,
  },
  journeyGroup: {
    marginBottom: 24,
  },
  journeyGroupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  journeyDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#8b5cf6',
    marginRight: 12,
    zIndex: 2,
  },
  journeyTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
    textTransform: 'capitalize',
  },
  journeyLineContainer: {
    flexDirection: 'row',
  },
  journeyLine: {
    width: 2,
    backgroundColor: '#2d2d3a',
    marginLeft: 5,
    marginRight: 20,
  },
  journeyItems: {
    flex: 1,
    gap: 12,
    paddingBottom: 16,
  },
  journeyCard: {
    backgroundColor: '#1a1a24',
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#2d2d3a',
  },
  journeyCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  journeyEmoji: {
    fontSize: 16,
  },
  journeyTime: {
    fontSize: 12,
    color: '#6b7280',
  },
  journeyTranscription: {
    fontSize: 14,
    color: '#d1d5db',
    lineHeight: 20,
  },
  timelineIndex: {
    position: 'absolute',
    right: 10,
    top: '10%',
    bottom: '10%',
    justifyContent: 'center',
    alignItems: 'flex-end',
    paddingLeft: 20,
  },
  timelineIndexItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    gap: 8,
  },
  timelineIndexDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#374151',
  },
  timelineIndexText: {
    fontSize: 11,
    color: '#9ca3af',
    fontWeight: '500',
    textTransform: 'capitalize',
  },
  galleryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    paddingTop: 12,
  },
  galleryItem: {
    width: '48%',
    aspectRatio: 1,
    borderRadius: 16,
    overflow: 'hidden',
    position: 'relative',
    backgroundColor: '#1a1a24',
    borderWidth: 1,
    borderColor: '#2d2d3a',
  },
  galleryImage: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  galleryOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  galleryEmoji: {
    fontSize: 16,
  },
  galleryDate: {
    fontSize: 12,
    color: '#fff',
    fontWeight: '500',
  },
});
