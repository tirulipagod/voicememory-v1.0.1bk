import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Animated,
  Dimensions,
  Alert,
  Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { useAuth } from '../../src/contexts/AuthContext';
import { usePersona, LISTENING_PERSONAS } from '../../src/contexts/PersonaContext';
import { localStorage, LocalMemory, ChatSession, ChatMessage as StoredChatMessage } from '../../src/services/LocalStorage';
import Constants from 'expo-constants';
import * as Speech from 'expo-speech';
import 'react-native-get-random-values';
import { v4 as uuidv4 } from 'uuid';

const { width } = Dimensions.get('window');

// Personas disponíveis para o chat com requisitos de desbloqueio
const CHAT_PERSONAS = [
  {
    id: 'therapeutic',
    name: 'Terapêutico',
    icon: 'heart',
    color: '#ec4899',
    emoji: '💗',
    description: 'Acolhedor e empático',
    requiredMemories: 0,
  },
  {
    id: 'coach',
    name: 'Coach',
    icon: 'flash',
    color: '#f59e0b',
    emoji: '⚡',
    description: 'Focado em ação',
    requiredMemories: 5,
  },
  {
    id: 'philosophical',
    name: 'Filosófico',
    icon: 'infinite',
    color: '#8b5cf6',
    emoji: '🔮',
    description: 'Busca significado',
    requiredMemories: 5,
  },
  {
    id: 'mentor',
    name: 'Mentor',
    icon: 'trending-up',
    color: '#10b981',
    emoji: '🎯',
    description: 'Crescimento pessoal',
    requiredMemories: 15,
  },
  {
    id: 'documentarian',
    name: 'Documentarista',
    icon: 'book',
    color: '#3b82f6',
    emoji: '📚',
    description: 'Organiza fatos',
    requiredMemories: 15,
  },
];

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  persona?: string;
}

export default function CopilotScreen() {
  const { user } = useAuth();
  const { selectedPersona: globalPersonaId, setSelectedPersona: setGlobalPersona } = usePersona();
  
  // Chat state
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  
  // Session state
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [chatSessions, setChatSessions] = useState<ChatSession[]>([]);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [showArchivedSessions, setShowArchivedSessions] = useState(false);
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  
  // Persona state
  const selectedPersona = CHAT_PERSONAS.find(p => p.id === globalPersonaId) || CHAT_PERSONAS[0];
  const setSelectedPersona = (persona: typeof CHAT_PERSONAS[0]) => {
    setGlobalPersona(persona.id as any);
  };
  const [showPersonaSelector, setShowPersonaSelector] = useState(false);
  
  // Memory state
  const [memories, setMemories] = useState<LocalMemory[]>([]);
  const [memoriesCount, setMemoriesCount] = useState(0);
  
  // TTS state
  const [speakingMessageId, setSpeakingMessageId] = useState<string | null>(null);
  
  const scrollViewRef = useRef<ScrollView>(null);
  const fadeAnim = useRef(new Animated.Value(0)).current;

  // Load data when screen receives focus
  useFocusEffect(
    useCallback(() => {
      loadMemories();
      loadSessions();
    }, [])
  );

  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 500,
      useNativeDriver: true,
    }).start();
  }, []);

  const loadMemories = async () => {
    try {
      const allMemories = await localStorage.getMemories();
      setMemories(allMemories);
      setMemoriesCount(allMemories.length);
    } catch (error) {
      console.error('Error loading memories:', error);
    }
  };

  const loadSessions = async () => {
    try {
      const sessions = await localStorage.getChatSessions(showArchivedSessions);
      setChatSessions(sessions);
      
      // Load active session or last session
      const activeSessionId = await localStorage.getActiveSessionId();
      if (activeSessionId) {
        const session = await localStorage.getChatSessionById(activeSessionId);
        if (session && !session.isArchived) {
          loadSession(session);
        } else if (sessions.length > 0) {
          loadSession(sessions[0]);
        }
      } else if (sessions.length > 0) {
        // Load most recent session
        loadSession(sessions[0]);
      }
    } catch (error) {
      console.error('Error loading sessions:', error);
    }
  };

  const loadSession = async (session: ChatSession) => {
    setCurrentSessionId(session.id);
    setMessages(session.messages.map(m => ({
      ...m,
      timestamp: new Date(m.timestamp),
    })));
    await localStorage.setActiveSessionId(session.id);
  };

  const startNewChat = async () => {
    // Clear current messages and reset session
    setMessages([]);
    setCurrentSessionId(null);
    await localStorage.setActiveSessionId(null);
    setShowHistoryModal(false);
  };

  // TTS Functions
  const speakMessage = (messageId: string, text: string) => {
    Speech.stop();
    
    if (speakingMessageId === messageId) {
      setSpeakingMessageId(null);
      return;
    }
    
    const cleanText = text.replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu, '');
    
    setSpeakingMessageId(messageId);
    
    Speech.speak(cleanText, {
      language: 'pt-BR',
      pitch: 1.0,
      rate: 0.95,
      onDone: () => setSpeakingMessageId(null),
      onStopped: () => setSpeakingMessageId(null),
      onError: () => setSpeakingMessageId(null),
    });
  };

  // Cleanup
  useEffect(() => {
    return () => {
      Speech.stop();
    };
  }, []);

  const getBackendUrl = () => {
    const backendUrl = process.env.EXPO_PUBLIC_BACKEND_URL || 
                       Constants.expoConfig?.extra?.backendUrl || 
                       '';
    return backendUrl;
  };

  const sendMessage = async () => {
    if (!inputText.trim() || isLoading) return;

    const userMessage: ChatMessage = {
      id: uuidv4(),
      role: 'user',
      content: inputText.trim(),
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMessage]);
    setInputText('');
    setIsLoading(true);

    // Create new session if needed
    let sessionId = currentSessionId;
    if (!sessionId) {
      sessionId = uuidv4();
      await localStorage.createChatSession(sessionId, userMessage.content);
      setCurrentSessionId(sessionId);
      await localStorage.setActiveSessionId(sessionId);
    }

    // Save user message to storage
    const storedUserMessage: StoredChatMessage = {
      id: userMessage.id,
      role: 'user',
      content: userMessage.content,
      timestamp: userMessage.timestamp.toISOString(),
    };
    await localStorage.addMessageToSession(sessionId, storedUserMessage);

    // Scroll to bottom
    setTimeout(() => {
      scrollViewRef.current?.scrollToEnd({ animated: true });
    }, 100);

    try {
      const memoryContext = memories.map(m => ({
        id: m.id,
        transcription: m.transcription,
        emotion: m.emotion,
        emotionEmoji: m.emotionEmoji,
        moodScore: m.moodScore,
        createdAt: m.createdAt,
        memoryDate: m.memoryDate || null,
        summary: m.summary || null,
      }));

      const backendUrl = getBackendUrl();
      const response = await fetch(`${backendUrl}/api/chat/memories`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: userMessage.content,
          persona: selectedPersona.id,
          memories: memoryContext,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to get response');
      }

      const data = await response.json();

      const assistantMessage: ChatMessage = {
        id: uuidv4(),
        role: 'assistant',
        content: data.response,
        timestamp: new Date(),
        persona: selectedPersona.id,
      };

      setMessages(prev => [...prev, assistantMessage]);

      // Save assistant message to storage
      const storedAssistantMessage: StoredChatMessage = {
        id: assistantMessage.id,
        role: 'assistant',
        content: assistantMessage.content,
        timestamp: assistantMessage.timestamp.toISOString(),
        persona: selectedPersona.id,
      };
      await localStorage.addMessageToSession(sessionId, storedAssistantMessage);
      
      // Reload sessions to update list
      const sessions = await localStorage.getChatSessions(showArchivedSessions);
      setChatSessions(sessions);

    } catch (error) {
      console.error('Error sending message:', error);
      const errorMessage: ChatMessage = {
        id: uuidv4(),
        role: 'assistant',
        content: 'Desculpe, ocorreu um erro ao processar sua mensagem. Por favor, tente novamente.',
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
      setTimeout(() => {
        scrollViewRef.current?.scrollToEnd({ animated: true });
      }, 100);
    }
  };

  // Session management functions
  const handleEditTitle = async () => {
    if (!editingSessionId || !editTitle.trim()) return;
    
    await localStorage.updateChatSessionTitle(editingSessionId, editTitle.trim());
    const sessions = await localStorage.getChatSessions(showArchivedSessions);
    setChatSessions(sessions);
    setEditingSessionId(null);
    setEditTitle('');
  };

  const handleArchiveSession = async (sessionId: string) => {
    await localStorage.archiveChatSession(sessionId);
    const sessions = await localStorage.getChatSessions(showArchivedSessions);
    setChatSessions(sessions);
    
    // If current session was archived, start new chat
    if (currentSessionId === sessionId) {
      await startNewChat();
    }
  };

  const handleUnarchiveSession = async (sessionId: string) => {
    await localStorage.unarchiveChatSession(sessionId);
    const sessions = await localStorage.getChatSessions(showArchivedSessions);
    setChatSessions(sessions);
  };

  const handleDeleteSession = (sessionId: string) => {
    Alert.alert(
      '🗑️ Excluir Conversa',
      'Esta ação é irreversível. Deseja realmente excluir esta conversa?',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Excluir',
          style: 'destructive',
          onPress: async () => {
            await localStorage.deleteChatSession(sessionId);
            const sessions = await localStorage.getChatSessions(showArchivedSessions);
            setChatSessions(sessions);
            
            if (currentSessionId === sessionId) {
              await startNewChat();
            }
          },
        },
      ]
    );
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    
    if (days === 0) return 'Hoje';
    if (days === 1) return 'Ontem';
    if (days < 7) return `${days} dias atrás`;
    
    return date.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
  };

  const renderMessage = (message: ChatMessage) => {
    const isUser = message.role === 'user';
    const persona = CHAT_PERSONAS.find(p => p.id === message.persona);
    const isSpeaking = speakingMessageId === message.id;

    return (
      <View
        key={message.id}
        style={[
          styles.messageContainer,
          isUser ? styles.userMessageContainer : styles.assistantMessageContainer,
        ]}
      >
        {!isUser && (
          <View style={[styles.avatarContainer, { backgroundColor: persona?.color || '#8b5cf6' }]}>
            <Text style={styles.avatarEmoji}>{persona?.emoji || '🤖'}</Text>
          </View>
        )}
        <View
          style={[
            styles.messageBubble,
            isUser ? styles.userBubble : styles.assistantBubble,
          ]}
        >
          <Text style={[styles.messageText, isUser && styles.userMessageText]}>
            {message.content}
          </Text>
          <View style={styles.messageFooter}>
            <Text style={[styles.messageTime, isUser && styles.userMessageTime]}>
              {message.timestamp.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
            </Text>
            {!isUser && (
              <TouchableOpacity
                style={[styles.speakButton, isSpeaking && styles.speakButtonActive]}
                onPress={() => speakMessage(message.id, message.content)}
              >
                <Ionicons
                  name={isSpeaking ? 'stop-circle' : 'volume-high'}
                  size={18}
                  color={isSpeaking ? '#ef4444' : '#8b5cf6'}
                />
              </TouchableOpacity>
            )}
          </View>
        </View>
        {isUser && (
          <View style={styles.userAvatar}>
            <Text style={styles.userAvatarText}>
              {user?.name?.charAt(0).toUpperCase() || 'U'}
            </Text>
          </View>
        )}
      </View>
    );
  };

  const renderWelcome = () => (
    <View style={styles.welcomeContainer}>
      <View style={styles.welcomeIconContainer}>
        <Ionicons name="chatbubbles" size={48} color="#8b5cf6" />
      </View>
      <Text style={styles.welcomeTitle}>Copiloto Emocional</Text>
      <Text style={styles.welcomeSubtitle}>
        Converse comigo sobre suas memórias! Posso te ajudar a refletir sobre padrões, 
        emoções e momentos importantes do seu diário.
      </Text>
      
      <View style={styles.memoriesInfo}>
        <Ionicons name="library" size={20} color="#8b5cf6" />
        <Text style={styles.memoriesInfoText}>
          {memoriesCount > 0 
            ? `Tenho acesso a ${memoriesCount} memória${memoriesCount > 1 ? 's' : ''} sua${memoriesCount > 1 ? 's' : ''}`
            : 'Você ainda não tem memórias gravadas'
          }
        </Text>
      </View>

      <View style={styles.suggestionsContainer}>
        <Text style={styles.suggestionsTitle}>Experimente perguntar:</Text>
        {[
          'Como tem sido meu humor essa semana?',
          'Me faça um resumo das minhas memórias',
          'Quais emoções apareceram mais?',
          'O que me deixou feliz ultimamente?',
        ].map((suggestion, index) => (
          <TouchableOpacity
            key={index}
            style={styles.suggestionChip}
            onPress={() => setInputText(suggestion)}
          >
            <Text style={styles.suggestionText}>{suggestion}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );

  const renderPersonaSelector = () => {
    const isPersonaUnlocked = (persona: typeof CHAT_PERSONAS[0]) => {
      return memoriesCount >= persona.requiredMemories;
    };

    const getUnlockMessage = (persona: typeof CHAT_PERSONAS[0]) => {
      const remaining = persona.requiredMemories - memoriesCount;
      if (remaining <= 0) return '';
      return `Desbloqueia após ${persona.requiredMemories} memórias (faltam ${remaining})`;
    };

    const handlePersonaClick = (persona: typeof CHAT_PERSONAS[0]) => {
      if (isPersonaUnlocked(persona)) {
        setSelectedPersona(persona);
        setShowPersonaSelector(false);
      } else {
        Alert.alert(
          '🔒 Persona Bloqueada',
          `Para desbloquear a persona "${persona.name}", você precisa ter ${persona.requiredMemories} memórias gravadas.\n\nVocê tem atualmente ${memoriesCount} memória${memoriesCount !== 1 ? 's' : ''}.\n\nContinue gravando para desbloquear novas personas!`,
          [{ text: 'Entendi', style: 'cancel' }]
        );
      }
    };

    return (
      <View style={styles.personaSelectorContainer}>
        <View style={styles.personaSelectorHeader}>
          <Text style={styles.personaSelectorTitle}>Escolha uma Persona</Text>
          <TouchableOpacity onPress={() => setShowPersonaSelector(false)}>
            <Ionicons name="close" size={24} color="#9ca3af" />
          </TouchableOpacity>
        </View>
        <Text style={styles.personaSelectorSubtitle}>
          A persona define o tom e foco das respostas
        </Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.personaList}>
          {CHAT_PERSONAS.map((persona) => {
            const unlocked = isPersonaUnlocked(persona);
            const isSelected = selectedPersona.id === persona.id;
            
            return (
              <TouchableOpacity
                key={persona.id}
                style={[
                  styles.personaCard,
                  isSelected && styles.personaCardSelected,
                  !unlocked && styles.personaCardLocked,
                  { 
                    borderColor: isSelected ? persona.color : '#2d2d3a',
                    opacity: unlocked ? 1 : 0.5,
                  }
                ]}
                onPress={() => handlePersonaClick(persona)}
                activeOpacity={unlocked ? 0.7 : 0.5}
              >
                {!unlocked && (
                  <View style={styles.lockBadge}>
                    <Text style={styles.lockIcon}>🔒</Text>
                  </View>
                )}
                <View style={[styles.personaIcon, { backgroundColor: persona.color + '20' }]}>
                  <Text style={styles.personaEmoji}>{persona.emoji}</Text>
                </View>
                <Text style={[styles.personaName, !unlocked && styles.personaNameLocked]}>
                  {persona.name}
                </Text>
                <Text style={styles.personaDescription}>
                  {unlocked ? persona.description : getUnlockMessage(persona)}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>
    );
  };

  const renderHistoryModal = () => (
    <Modal
      visible={showHistoryModal}
      animationType="slide"
      transparent={true}
      onRequestClose={() => setShowHistoryModal(false)}
    >
      <View style={styles.historyModalOverlay}>
        <View style={styles.historyModalContent}>
          <View style={styles.historyModalHeader}>
            <Text style={styles.historyModalTitle}>📚 Histórico de Conversas</Text>
            <TouchableOpacity onPress={() => setShowHistoryModal(false)}>
              <Ionicons name="close" size={24} color="#9ca3af" />
            </TouchableOpacity>
          </View>
          
          {/* Toggle Arquivadas */}
          <TouchableOpacity
            style={styles.archivedToggle}
            onPress={async () => {
              const newValue = !showArchivedSessions;
              setShowArchivedSessions(newValue);
              const sessions = await localStorage.getChatSessions(newValue);
              setChatSessions(sessions);
            }}
          >
            <Ionicons 
              name={showArchivedSessions ? 'folder-open' : 'folder'} 
              size={18} 
              color="#6b7280" 
            />
            <Text style={styles.archivedToggleText}>
              {showArchivedSessions ? 'Mostrando arquivadas' : 'Ver arquivadas'}
            </Text>
          </TouchableOpacity>
          
          <ScrollView style={styles.sessionsList} showsVerticalScrollIndicator={false}>
            {chatSessions.length === 0 ? (
              <View style={styles.emptyHistory}>
                <Ionicons name="chatbubble-ellipses-outline" size={48} color="#4b5563" />
                <Text style={styles.emptyHistoryText}>Nenhuma conversa ainda</Text>
                <Text style={styles.emptyHistorySubtext}>
                  Comece uma nova conversa para vê-la aqui
                </Text>
              </View>
            ) : (
              chatSessions.map((session) => (
                <View key={session.id} style={styles.sessionCard}>
                  {editingSessionId === session.id ? (
                    <View style={styles.editTitleContainer}>
                      <TextInput
                        style={styles.editTitleInput}
                        value={editTitle}
                        onChangeText={setEditTitle}
                        placeholder="Nome da conversa"
                        placeholderTextColor="#6b7280"
                        autoFocus
                      />
                      <TouchableOpacity onPress={handleEditTitle} style={styles.editTitleBtn}>
                        <Ionicons name="checkmark" size={20} color="#10b981" />
                      </TouchableOpacity>
                      <TouchableOpacity 
                        onPress={() => { setEditingSessionId(null); setEditTitle(''); }} 
                        style={styles.editTitleBtn}
                      >
                        <Ionicons name="close" size={20} color="#ef4444" />
                      </TouchableOpacity>
                    </View>
                  ) : (
                    <TouchableOpacity
                      style={styles.sessionCardContent}
                      onPress={async () => {
                        await loadSession(session);
                        setShowHistoryModal(false);
                      }}
                    >
                      <View style={styles.sessionCardLeft}>
                        <View style={[
                          styles.sessionIcon, 
                          session.isArchived && styles.sessionIconArchived,
                          currentSessionId === session.id && styles.sessionIconActive
                        ]}>
                          <Ionicons 
                            name={session.isArchived ? 'archive' : 'chatbubble'} 
                            size={18} 
                            color={currentSessionId === session.id ? '#8b5cf6' : '#9ca3af'} 
                          />
                        </View>
                        <View style={styles.sessionInfo}>
                          <Text style={styles.sessionTitle} numberOfLines={1}>
                            {session.title}
                          </Text>
                          <Text style={styles.sessionDate}>
                            {formatDate(session.updatedAt)} · {session.messages.length} msgs
                          </Text>
                        </View>
                      </View>
                      
                      {/* Session Actions */}
                      <View style={styles.sessionActions}>
                        <TouchableOpacity 
                          style={styles.sessionActionBtn}
                          onPress={() => {
                            setEditingSessionId(session.id);
                            setEditTitle(session.title);
                          }}
                        >
                          <Ionicons name="pencil" size={16} color="#9ca3af" />
                        </TouchableOpacity>
                        <TouchableOpacity 
                          style={styles.sessionActionBtn}
                          onPress={() => session.isArchived 
                            ? handleUnarchiveSession(session.id)
                            : handleArchiveSession(session.id)
                          }
                        >
                          <Ionicons 
                            name={session.isArchived ? 'arrow-undo' : 'archive'} 
                            size={16} 
                            color="#9ca3af" 
                          />
                        </TouchableOpacity>
                        <TouchableOpacity 
                          style={styles.sessionActionBtn}
                          onPress={() => handleDeleteSession(session.id)}
                        >
                          <Ionicons name="trash" size={16} color="#ef4444" />
                        </TouchableOpacity>
                      </View>
                    </TouchableOpacity>
                  )}
                </View>
              ))
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );

  return (
    <SafeAreaView style={styles.container}>
      <Animated.View style={[styles.content, { opacity: fadeAnim }]}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <Ionicons name="chatbubbles" size={24} color="#8b5cf6" />
            <Text style={styles.headerTitle}>Copiloto</Text>
          </View>
          
          <View style={styles.headerRight}>
            {/* New Chat Button */}
            <TouchableOpacity 
              style={styles.headerBtn}
              onPress={startNewChat}
            >
              <Ionicons name="add" size={22} color="#8b5cf6" />
            </TouchableOpacity>
            
            {/* History Button */}
            <TouchableOpacity 
              style={styles.headerBtn}
              onPress={() => setShowHistoryModal(true)}
            >
              <Ionicons name="menu" size={22} color="#8b5cf6" />
              {chatSessions.length > 0 && (
                <View style={styles.historyBadge}>
                  <Text style={styles.historyBadgeText}>
                    {chatSessions.length > 9 ? '9+' : chatSessions.length}
                  </Text>
                </View>
              )}
            </TouchableOpacity>
            
            {/* Persona Button */}
            <TouchableOpacity 
              style={[styles.personaButton, { backgroundColor: selectedPersona.color + '20' }]}
              onPress={() => setShowPersonaSelector(!showPersonaSelector)}
            >
              <Text style={styles.personaButtonEmoji}>{selectedPersona.emoji}</Text>
              <Ionicons 
                name={showPersonaSelector ? 'chevron-up' : 'chevron-down'} 
                size={14} 
                color={selectedPersona.color} 
              />
            </TouchableOpacity>
          </View>
        </View>

        {/* Persona Selector */}
        {showPersonaSelector && renderPersonaSelector()}

        {/* Chat Area */}
        <KeyboardAvoidingView 
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.chatContainer}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
        >
          <ScrollView
            ref={scrollViewRef}
            style={styles.messagesContainer}
            contentContainerStyle={styles.messagesContent}
            showsVerticalScrollIndicator={false}
          >
            {messages.length === 0 ? (
              renderWelcome()
            ) : (
              messages.map(renderMessage)
            )}
            
            {isLoading && (
              <View style={styles.loadingContainer}>
                <View style={[styles.avatarContainer, { backgroundColor: selectedPersona.color }]}>
                  <Text style={styles.avatarEmoji}>{selectedPersona.emoji}</Text>
                </View>
                <View style={styles.loadingBubble}>
                  <ActivityIndicator size="small" color="#8b5cf6" />
                  <Text style={styles.loadingText}>IA está pensando...</Text>
                </View>
              </View>
            )}
          </ScrollView>

          {/* Input Area */}
          <View style={styles.inputContainer}>
            <TextInput
              style={styles.input}
              value={inputText}
              onChangeText={setInputText}
              placeholder="Pergunte sobre suas memórias..."
              placeholderTextColor="#6b7280"
              multiline
              maxLength={500}
              editable={!isLoading}
            />
            <TouchableOpacity
              style={[
                styles.sendButton,
                (!inputText.trim() || isLoading) && styles.sendButtonDisabled,
              ]}
              onPress={sendMessage}
              disabled={!inputText.trim() || isLoading}
            >
              <Ionicons
                name="send"
                size={20}
                color={(!inputText.trim() || isLoading) ? '#6b7280' : '#fff'}
              />
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Animated.View>
      
      {/* History Modal */}
      {renderHistoryModal()}
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
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#1a1a24',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(139, 92, 246, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  historyBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    backgroundColor: '#8b5cf6',
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  historyBadgeText: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#fff',
  },
  personaButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 20,
  },
  personaButtonEmoji: {
    fontSize: 18,
  },
  personaButtonText: {
    fontSize: 14,
    fontWeight: '600',
  },
  // Persona Selector Styles
  personaSelectorContainer: {
    backgroundColor: '#12121a',
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#1a1a24',
  },
  personaSelectorHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    marginBottom: 4,
  },
  personaSelectorTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  personaSelectorSubtitle: {
    fontSize: 13,
    color: '#6b7280',
    paddingHorizontal: 20,
    marginBottom: 12,
  },
  personaList: {
    paddingHorizontal: 16,
  },
  personaCard: {
    width: 120,
    padding: 12,
    marginHorizontal: 4,
    backgroundColor: '#1a1a24',
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#2d2d3a',
    alignItems: 'center',
  },
  personaCardSelected: {
    backgroundColor: '#1f1f2e',
  },
  personaCardLocked: {
    backgroundColor: '#12121a',
  },
  personaIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  personaEmoji: {
    fontSize: 24,
  },
  personaName: {
    fontSize: 13,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 2,
  },
  personaNameLocked: {
    color: '#6b7280',
  },
  personaDescription: {
    fontSize: 10,
    color: '#6b7280',
    textAlign: 'center',
  },
  lockBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    zIndex: 10,
  },
  lockIcon: {
    fontSize: 14,
  },
  // Chat Styles
  chatContainer: {
    flex: 1,
  },
  messagesContainer: {
    flex: 1,
  },
  messagesContent: {
    paddingHorizontal: 16,
    paddingVertical: 16,
    flexGrow: 1,
  },
  welcomeContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
    paddingVertical: 40,
  },
  welcomeIconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(139, 92, 246, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  welcomeTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 12,
  },
  welcomeSubtitle: {
    fontSize: 15,
    color: '#9ca3af',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 24,
  },
  memoriesInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(139, 92, 246, 0.1)',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    marginBottom: 24,
  },
  memoriesInfoText: {
    fontSize: 14,
    color: '#8b5cf6',
  },
  suggestionsContainer: {
    width: '100%',
  },
  suggestionsTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6b7280',
    marginBottom: 12,
    textAlign: 'center',
  },
  suggestionChip: {
    backgroundColor: '#1a1a24',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#2d2d3a',
  },
  suggestionText: {
    fontSize: 14,
    color: '#d1d5db',
    textAlign: 'center',
  },
  // Message Styles
  messageContainer: {
    flexDirection: 'row',
    marginBottom: 16,
    alignItems: 'flex-end',
  },
  userMessageContainer: {
    justifyContent: 'flex-end',
  },
  assistantMessageContainer: {
    justifyContent: 'flex-start',
  },
  avatarContainer: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  avatarEmoji: {
    fontSize: 16,
  },
  userAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#8b5cf6',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
  },
  userAvatarText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },
  messageBubble: {
    maxWidth: width * 0.7,
    padding: 12,
    borderRadius: 16,
  },
  userBubble: {
    backgroundColor: '#8b5cf6',
    borderBottomRightRadius: 4,
  },
  assistantBubble: {
    backgroundColor: '#1a1a24',
    borderBottomLeftRadius: 4,
    borderWidth: 1,
    borderColor: '#2d2d3a',
  },
  messageText: {
    fontSize: 15,
    color: '#e5e7eb',
    lineHeight: 22,
  },
  userMessageText: {
    color: '#fff',
  },
  messageTime: {
    fontSize: 11,
    color: '#6b7280',
  },
  userMessageTime: {
    color: 'rgba(255, 255, 255, 0.7)',
  },
  messageFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 6,
  },
  speakButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(139, 92, 246, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
  },
  speakButtonActive: {
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
  },
  loadingContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    marginBottom: 16,
  },
  loadingBubble: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#1a1a24',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 16,
    borderBottomLeftRadius: 4,
    borderWidth: 1,
    borderColor: '#2d2d3a',
  },
  loadingText: {
    fontSize: 14,
    color: '#9ca3af',
  },
  // Input Styles
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#12121a',
    borderTopWidth: 1,
    borderTopColor: '#1a1a24',
    gap: 10,
  },
  input: {
    flex: 1,
    backgroundColor: '#1a1a24',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 15,
    color: '#fff',
    maxHeight: 100,
    borderWidth: 1,
    borderColor: '#2d2d3a',
  },
  sendButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#8b5cf6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendButtonDisabled: {
    backgroundColor: '#2d2d3a',
  },
  // History Modal Styles
  historyModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    justifyContent: 'flex-end',
  },
  historyModalContent: {
    backgroundColor: '#0a0a0f',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 20,
    paddingBottom: Platform.OS === 'ios' ? 40 : 20,
    maxHeight: '85%',
  },
  historyModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    marginBottom: 12,
  },
  historyModalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
  },
  archivedToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 20,
    paddingVertical: 8,
    marginBottom: 12,
  },
  archivedToggleText: {
    fontSize: 13,
    color: '#6b7280',
  },
  sessionsList: {
    paddingHorizontal: 16,
  },
  emptyHistory: {
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyHistoryText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#6b7280',
    marginTop: 16,
  },
  emptyHistorySubtext: {
    fontSize: 13,
    color: '#4b5563',
    marginTop: 4,
  },
  sessionCard: {
    backgroundColor: '#1a1a24',
    borderRadius: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#2d2d3a',
  },
  sessionCardContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 14,
  },
  sessionCardLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  sessionIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(139, 92, 246, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  sessionIconArchived: {
    backgroundColor: 'rgba(107, 114, 128, 0.1)',
  },
  sessionIconActive: {
    backgroundColor: 'rgba(139, 92, 246, 0.2)',
    borderWidth: 2,
    borderColor: '#8b5cf6',
  },
  sessionInfo: {
    flex: 1,
  },
  sessionTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 2,
  },
  sessionDate: {
    fontSize: 12,
    color: '#6b7280',
  },
  sessionActions: {
    flexDirection: 'row',
    gap: 4,
  },
  sessionActionBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(107, 114, 128, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  editTitleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    gap: 8,
  },
  editTitleInput: {
    flex: 1,
    backgroundColor: '#12121a',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 14,
    color: '#fff',
    borderWidth: 1,
    borderColor: '#8b5cf6',
  },
  editTitleBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(107, 114, 128, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
