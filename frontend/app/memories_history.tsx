import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Modal,
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
  const { emotion: filterEmotion } = useLocalSearchParams<{ emotion?: string }>();
  const [memories, setMemories] = useState<Memory[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showSortModal, setShowSortModal] = useState(false);
  const [sortBy, setSortBy] = useState<SortBy>('created_at');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');

  const fetchMemories = useCallback(async () => {
    try {
      // Get memories from local storage
      const localMemories = await localStorage.getMemories();
      
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
        }));

      // Filter by emotion if specified
      if (filterEmotion) {
        transformed = transformed.filter(m => 
          m.emotion.toLowerCase() === filterEmotion.toLowerCase()
        );
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
  }, [sortBy, sortOrder, filterEmotion]);

  // Refresh when screen gets focus
  useFocusEffect(
    useCallback(() => {
      fetchMemories();
    }, [fetchMemories])
  );

  useEffect(() => {
    fetchMemories();
  }, [sortBy, sortOrder, filterEmotion]);

  const clearFilter = () => {
    router.setParams({ emotion: undefined });
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

  if (isLoading && memories.length === 0) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#8b5cf6" />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>
            {filterEmotion ? `Memórias: ${filterEmotion}` : 'Minhas Memórias'}
          </Text>
          <Text style={styles.subtitle}>{memories.length} registros</Text>
        </View>
        
        {/* Sort controls */}
        <View style={styles.sortControls}>
          {filterEmotion && (
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
      ) : (
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
});
