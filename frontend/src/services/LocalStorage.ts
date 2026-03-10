import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEYS = {
  USER: '@diario:user',
  MEMORIES: '@diario:memories',
  PROFILE: '@diario:profile',
  SYNC_STATUS: '@diario:sync_status',
  GOOGLE_TOKEN: '@diario:google_token',
  LAST_SYNC: '@diario:last_sync',
  CHAT_SESSIONS: '@diario:chat_sessions',
  ACTIVE_SESSION: '@diario:active_session',
};

export interface LocalUser {
  id: string;
  email: string;
  name: string;
  photo?: string;
  googleId: string;
  createdAt: string;
}

export interface EmotionDetail {
  emotion: string;
  emoji: string;
  intensity: number;
}

export interface LocalMemory {
  id: string;
  userId: string;
  transcription: string;
  emotion: string;
  emotionEmoji: string;
  moodScore: number;
  audioBase64?: string;
  durationSeconds?: number;
  segments?: { text: string; startTime: number; endTime: number }[];
  memoryDate?: string;
  emotions?: EmotionDetail[];
  summary?: string;
  createdAt: string;
  updatedAt: string;
  synced: boolean;
  deleted?: boolean;
}

export interface SyncStatus {
  lastSync: string | null;
  pendingChanges: number;
  isSyncing: boolean;
}

// Chat Session interfaces
export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  persona?: string;
}

export interface ChatSession {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  isArchived: boolean;
  messages: ChatMessage[];
}

class LocalStorageService {
  // User methods
  async saveUser(user: LocalUser): Promise<void> {
    await AsyncStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(user));
  }

  async getUser(): Promise<LocalUser | null> {
    const data = await AsyncStorage.getItem(STORAGE_KEYS.USER);
    return data ? JSON.parse(data) : null;
  }

  async clearUser(): Promise<void> {
    await AsyncStorage.removeItem(STORAGE_KEYS.USER);
  }

  // Memory methods
  async saveMemory(memory: LocalMemory): Promise<void> {
    const memories = await this.getAllMemoriesIncludingDeleted();
    const existingIndex = memories.findIndex(m => m.id === memory.id);
    
    if (existingIndex >= 0) {
      memories[existingIndex] = { ...memory, synced: false };
    } else {
      memories.unshift({ ...memory, synced: false });
    }
    
    await AsyncStorage.setItem(STORAGE_KEYS.MEMORIES, JSON.stringify(memories));
  }

  async getMemories(): Promise<LocalMemory[]> {
    const data = await AsyncStorage.getItem(STORAGE_KEYS.MEMORIES);
    const memories: LocalMemory[] = data ? JSON.parse(data) : [];
    return memories.filter(m => !m.deleted).sort((a, b) => 
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }

  async getMemoryById(id: string): Promise<LocalMemory | null> {
    const memories = await this.getMemories();
    return memories.find(m => m.id === id) || null;
  }

  async deleteMemory(id: string): Promise<void> {
    const memories = await this.getAllMemoriesIncludingDeleted();
    const index = memories.findIndex(m => m.id === id);
    if (index >= 0) {
      memories[index] = { 
        ...memories[index], 
        deleted: true, 
        synced: false,
        updatedAt: new Date().toISOString()
      };
      await AsyncStorage.setItem(STORAGE_KEYS.MEMORIES, JSON.stringify(memories));
      console.log('Memory marked as deleted:', id);
    } else {
      console.log('Memory not found for deletion:', id);
    }
  }

  async deleteMemoryAudio(id: string): Promise<void> {
    const memories = await this.getAllMemoriesIncludingDeleted();
    const index = memories.findIndex(m => m.id === id);
    if (index >= 0) {
      // Remove audio data by setting to null (not undefined for JSON serialization)
      const updatedMemory = { 
        ...memories[index],
        synced: false,
        updatedAt: new Date().toISOString()
      };
      // Explicitly delete audio fields
      delete updatedMemory.audioBase64;
      delete updatedMemory.durationSeconds;
      updatedMemory.segments = [];
      
      memories[index] = updatedMemory;
      await AsyncStorage.setItem(STORAGE_KEYS.MEMORIES, JSON.stringify(memories));
      console.log('Audio deleted for memory:', id);
    } else {
      console.log('Memory not found for audio deletion:', id);
    }
  }

  async getAllMemoriesIncludingDeleted(): Promise<LocalMemory[]> {
    const data = await AsyncStorage.getItem(STORAGE_KEYS.MEMORIES);
    return data ? JSON.parse(data) : [];
  }

  async getUnsyncedMemories(): Promise<LocalMemory[]> {
    const memories = await this.getAllMemoriesIncludingDeleted();
    return memories.filter(m => !m.synced);
  }

  async markMemoriesAsSynced(ids: string[]): Promise<void> {
    const memories = await this.getAllMemoriesIncludingDeleted();
    const updated = memories.map(m => 
      ids.includes(m.id) ? { ...m, synced: true } : m
    );
    // Remove deleted + synced memories
    const cleaned = updated.filter(m => !(m.deleted && m.synced));
    await AsyncStorage.setItem(STORAGE_KEYS.MEMORIES, JSON.stringify(cleaned));
  }

  async importMemories(memories: LocalMemory[]): Promise<void> {
    const existing = await this.getAllMemoriesIncludingDeleted();
    const existingIds = new Set(existing.map(m => m.id));
    
    const toAdd = memories.filter(m => !existingIds.has(m.id));
    const merged = [...existing, ...toAdd.map(m => ({ ...m, synced: true }))];
    
    await AsyncStorage.setItem(STORAGE_KEYS.MEMORIES, JSON.stringify(merged));
  }

  // Profile methods
  async saveProfile(profile: any): Promise<void> {
    await AsyncStorage.setItem(STORAGE_KEYS.PROFILE, JSON.stringify(profile));
  }

  async getProfile(): Promise<any | null> {
    const data = await AsyncStorage.getItem(STORAGE_KEYS.PROFILE);
    return data ? JSON.parse(data) : null;
  }

  // Sync status
  async getSyncStatus(): Promise<SyncStatus> {
    const lastSync = await AsyncStorage.getItem(STORAGE_KEYS.LAST_SYNC);
    const unsynced = await this.getUnsyncedMemories();
    return {
      lastSync,
      pendingChanges: unsynced.length,
      isSyncing: false,
    };
  }

  async setLastSync(date: string): Promise<void> {
    await AsyncStorage.setItem(STORAGE_KEYS.LAST_SYNC, date);
  }

  // Google token
  async saveGoogleToken(token: string): Promise<void> {
    await AsyncStorage.setItem(STORAGE_KEYS.GOOGLE_TOKEN, token);
  }

  async getGoogleToken(): Promise<string | null> {
    return await AsyncStorage.getItem(STORAGE_KEYS.GOOGLE_TOKEN);
  }

  async clearGoogleToken(): Promise<void> {
    await AsyncStorage.removeItem(STORAGE_KEYS.GOOGLE_TOKEN);
  }

  // ========== Chat Session Methods ==========
  
  // Get all chat sessions (excluding archived by default)
  async getChatSessions(includeArchived: boolean = false): Promise<ChatSession[]> {
    const data = await AsyncStorage.getItem(STORAGE_KEYS.CHAT_SESSIONS);
    const sessions: ChatSession[] = data ? JSON.parse(data) : [];
    const filtered = includeArchived ? sessions : sessions.filter(s => !s.isArchived);
    return filtered.sort((a, b) => 
      new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    );
  }

  // Get a specific chat session by ID
  async getChatSessionById(id: string): Promise<ChatSession | null> {
    const sessions = await this.getChatSessions(true);
    return sessions.find(s => s.id === id) || null;
  }

  // Create a new chat session
  async createChatSession(id: string, firstMessage?: string): Promise<ChatSession> {
    const sessions = await this.getChatSessions(true);
    const now = new Date().toISOString();
    
    const newSession: ChatSession = {
      id,
      title: firstMessage ? firstMessage.substring(0, 30) + (firstMessage.length > 30 ? '...' : '') : 'Nova conversa',
      createdAt: now,
      updatedAt: now,
      isArchived: false,
      messages: [],
    };
    
    sessions.unshift(newSession);
    await AsyncStorage.setItem(STORAGE_KEYS.CHAT_SESSIONS, JSON.stringify(sessions));
    return newSession;
  }

  // Save/update a chat session
  async saveChatSession(session: ChatSession): Promise<void> {
    const sessions = await this.getChatSessions(true);
    const index = sessions.findIndex(s => s.id === session.id);
    
    const updatedSession = {
      ...session,
      updatedAt: new Date().toISOString(),
    };
    
    if (index >= 0) {
      sessions[index] = updatedSession;
    } else {
      sessions.unshift(updatedSession);
    }
    
    await AsyncStorage.setItem(STORAGE_KEYS.CHAT_SESSIONS, JSON.stringify(sessions));
  }

  // Add message to a session
  async addMessageToSession(sessionId: string, message: ChatMessage): Promise<void> {
    const session = await this.getChatSessionById(sessionId);
    if (session) {
      session.messages.push(message);
      // Update title if it's the first user message
      if (session.messages.filter(m => m.role === 'user').length === 1 && message.role === 'user') {
        session.title = message.content.substring(0, 30) + (message.content.length > 30 ? '...' : '');
      }
      await this.saveChatSession(session);
    }
  }

  // Update session title
  async updateChatSessionTitle(sessionId: string, title: string): Promise<void> {
    const session = await this.getChatSessionById(sessionId);
    if (session) {
      session.title = title;
      await this.saveChatSession(session);
    }
  }

  // Archive a session
  async archiveChatSession(sessionId: string): Promise<void> {
    const session = await this.getChatSessionById(sessionId);
    if (session) {
      session.isArchived = true;
      await this.saveChatSession(session);
    }
  }

  // Unarchive a session
  async unarchiveChatSession(sessionId: string): Promise<void> {
    const session = await this.getChatSessionById(sessionId);
    if (session) {
      session.isArchived = false;
      await this.saveChatSession(session);
    }
  }

  // Delete a session permanently
  async deleteChatSession(sessionId: string): Promise<void> {
    const sessions = await this.getChatSessions(true);
    const filtered = sessions.filter(s => s.id !== sessionId);
    await AsyncStorage.setItem(STORAGE_KEYS.CHAT_SESSIONS, JSON.stringify(filtered));
  }

  // Get/Set active session ID
  async getActiveSessionId(): Promise<string | null> {
    return await AsyncStorage.getItem(STORAGE_KEYS.ACTIVE_SESSION);
  }

  async setActiveSessionId(sessionId: string | null): Promise<void> {
    if (sessionId) {
      await AsyncStorage.setItem(STORAGE_KEYS.ACTIVE_SESSION, sessionId);
    } else {
      await AsyncStorage.removeItem(STORAGE_KEYS.ACTIVE_SESSION);
    }
  }

  // Clear all data
  async clearAll(): Promise<void> {
    await AsyncStorage.multiRemove(Object.values(STORAGE_KEYS));
  }
}

export const localStorage = new LocalStorageService();
