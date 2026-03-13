import AsyncStorage from '@react-native-async-storage/async-storage';
import { File, Paths } from 'expo-file-system/next';
const STORAGE_KEYS = {
  USER: '@diario:user',
  MEMORIES: '@diario:memories',
  PROFILE: '@diario:profile',
  SYNC_STATUS: '@diario:sync_status',
  GOOGLE_TOKEN: '@diario:google_token',
  LAST_SYNC: '@diario:last_sync',
  CHAT_SESSIONS: '@diario:chat_sessions',
  ACTIVE_SESSION: '@diario:active_session',
  CONNECTIONS: '@diario:connections',
};

export interface LocalUser {
  id: string;
  email: string;
  name: string;
  photo?: string;
  googleId: string;
  createdAt: string;
  hasCompletedOnboarding?: boolean;
  userGoal?: string;
  birthDate?: string;
  avatarLevel?: number;
  avatarXP?: number;
  lastChallengeCompletedAt?: string;
  completedDailyChallenges?: string[];
  allTimeCompletedChallenges?: Array<{
    text: string;
    completedAt: string;
    emoji?: string;
  }>;
  storagePreference?: 'both' | 'text_only';
}

export interface EmotionDetail {
  emotion: string;
  emoji: string;
  intensity: number;
}

export interface Connection {
  id: string; // UUID
  userId: string;
  name: string; // Ex: "Vó Maria"
  relationship: string; // Ex: "Avó", "Amigo"
  photoUri?: string; // Caminho para foto local
  signatureMemoryId?: string; // Áudio de introdução/biografia
  createdAt: string;
  updatedAt: string;
  synced: boolean;
  deleted?: boolean;
  // Phase 3.3 – Copiloto Relacional (smart-cache: only updated when new memory is added)
  copilotSummary?: string;          // 2-line AI relational insight
  copilotSummaryUpdatedAt?: string; // ISO timestamp – used to detect stale cache
  copilotSummaryMemoryCount?: number; // memory count at time of last summary generation
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
  photoUrl?: string;
  createdAt: string;
  updatedAt: string;
  synced: boolean;
  deleted?: boolean;
  mentionedConnections?: string[]; // IDs of connections mentioned in this memory
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

    const user = await this.getUser();
    const storagePref = user?.storagePreference || 'both';

    if (memory.audioBase64 && storagePref === 'both') {
      try {
        const audioFile = new File(Paths.document, `audio_${memory.id}.txt`);
        if (!audioFile.exists) {
          audioFile.create();
        }
        audioFile.write(memory.audioBase64);
      } catch (e) {
        console.warn('Failed to save audio Base64 to fs:', e);
      }
    }

    // Strip audio from sqlite storage to prevent CursorWindow > 2MB crashes
    const memoryToSave = { ...memory };
    delete memoryToSave.audioBase64;

    if (existingIndex >= 0) {
      memories[existingIndex] = { ...memoryToSave, synced: false };
    } else {
      memories.unshift({ ...memoryToSave, synced: false });
    }

    await AsyncStorage.setItem(STORAGE_KEYS.MEMORIES, JSON.stringify(memories));
  }

  async getMemories(): Promise<LocalMemory[]> {
    try {
      const data = await AsyncStorage.getItem(STORAGE_KEYS.MEMORIES);
      const memories: LocalMemory[] = data ? JSON.parse(data) : [];
      return memories.filter(m => !m.deleted).sort((a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
    } catch (e) {
      console.error('Critical storage error reading memories (CursorWindow limit):', e);
      await AsyncStorage.removeItem(STORAGE_KEYS.MEMORIES);
      return [];
    }
  }

  async getMemoryById(id: string): Promise<LocalMemory | null> {
    const memories = await this.getMemories();
    const memory = memories.find(m => m.id === id);
    if (memory) {
      try {
        const audioFile = new File(Paths.document, `audio_${memory.id}.txt`);
        if (audioFile.exists) {
          memory.audioBase64 = await audioFile.text();
        }
      } catch (e) {
        console.warn('Failed to load audio from FS:', e);
      }
      return memory;
    }
    return null;
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

  async restoreMemory(id: string): Promise<void> {
    const memories = await this.getAllMemoriesIncludingDeleted();
    const index = memories.findIndex(m => m.id === id);
    if (index >= 0) {
      memories[index] = {
        ...memories[index],
        deleted: false,
        synced: false,
        updatedAt: new Date().toISOString()
      };
      await AsyncStorage.setItem(STORAGE_KEYS.MEMORIES, JSON.stringify(memories));
    }
  }

  async permanentlyDeleteMemory(id: string): Promise<void> {
    const memories = await this.getAllMemoriesIncludingDeleted();
    const filtered = memories.filter(m => m.id !== id);

    // Also delete audio file
    try {
      const audioFile = new File(Paths.document, `audio_${id}.txt`);
      if (audioFile.exists) {
        audioFile.delete();
      }
    } catch (e) { }

    await AsyncStorage.setItem(STORAGE_KEYS.MEMORIES, JSON.stringify(filtered));
  }

  async getDeletedMemories(): Promise<LocalMemory[]> {
    const all = await this.getAllMemoriesIncludingDeleted();
    return all.filter(m => m.deleted);
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

      try {
        const audioFile = new File(Paths.document, `audio_${id}.txt`);
        if (audioFile.exists) {
          audioFile.delete();
        }
      } catch (e) { }

      memories[index] = updatedMemory;
      await AsyncStorage.setItem(STORAGE_KEYS.MEMORIES, JSON.stringify(memories));
      console.log('Audio deleted for memory:', id);
    } else {
      console.log('Memory not found for audio deletion:', id);
    }
  }

  async getAllMemoriesIncludingDeleted(): Promise<LocalMemory[]> {
    try {
      const data = await AsyncStorage.getItem(STORAGE_KEYS.MEMORIES);
      return data ? JSON.parse(data) : [];
    } catch (e) {
      console.error('Critical storage error reading all memories:', e);
      await AsyncStorage.removeItem(STORAGE_KEYS.MEMORIES);
      return [];
    }
  }

  async getUnsyncedMemories(): Promise<LocalMemory[]> {
    const memories = await this.getAllMemoriesIncludingDeleted();
    const unsynced = memories.filter(m => !m.synced);
    for (const m of unsynced) {
      if (!m.deleted) {
        try {
          const audioFile = new File(Paths.document, `audio_${m.id}.txt`);
          if (audioFile.exists) {
            m.audioBase64 = await audioFile.text();
          }
        } catch (e) { }
      }
    }
    return unsynced;
  }

  async markMemoriesAsSynced(ids: string[]): Promise<void> {
    // Note: getMemories will strip audioBase64 since we don't save it back, which is correct
    // We don't want to load all file system files just to mark as synced
    let data;
    try {
      data = await AsyncStorage.getItem(STORAGE_KEYS.MEMORIES);
    } catch (e) { return; }
    const memories: LocalMemory[] = data ? JSON.parse(data) : [];

    const updated = memories.map(m =>
      ids.includes(m.id) ? { ...m, synced: true } : m
    );
    // Remove deleted + synced memories
    const cleaned = updated.filter(m => !(m.deleted && m.synced));
    await AsyncStorage.setItem(STORAGE_KEYS.MEMORIES, JSON.stringify(cleaned));
  }

  async importMemories(memories: LocalMemory[]): Promise<void> {
    let existing: LocalMemory[] = [];
    try {
      const data = await AsyncStorage.getItem(STORAGE_KEYS.MEMORIES);
      existing = data ? JSON.parse(data) : [];
    } catch (e) {
      await AsyncStorage.removeItem(STORAGE_KEYS.MEMORIES);
    }

    const existingIds = new Set(existing.map(m => m.id));

    const toAdd = memories.filter(m => !existingIds.has(m.id));
    const merged = [...existing, ...toAdd.map(m => ({ ...m, synced: true }))];

    for (const m of merged) {
      if (m.audioBase64) {
        try {
          const audioFile = new File(Paths.document, `audio_${m.id}.txt`);
          if (!audioFile.exists) {
            audioFile.create();
          }
          audioFile.write(m.audioBase64);
        } catch (e) { }
        delete m.audioBase64;
      }
    }

    await AsyncStorage.setItem(STORAGE_KEYS.MEMORIES, JSON.stringify(merged));
  }

  // ========== Connections Methods ==========
  async saveConnection(connection: Connection): Promise<void> {
    const connections = await this.getAllConnectionsIncludingDeleted();
    const existingIndex = connections.findIndex(c => c.id === connection.id);

    if (existingIndex >= 0) {
      connections[existingIndex] = { ...connection, synced: false, updatedAt: new Date().toISOString() };
    } else {
      connections.unshift({ ...connection, synced: false });
    }

    await AsyncStorage.setItem(STORAGE_KEYS.CONNECTIONS, JSON.stringify(connections));
  }

  async getConnections(): Promise<Connection[]> {
    const data = await AsyncStorage.getItem(STORAGE_KEYS.CONNECTIONS);
    const connections: Connection[] = data ? JSON.parse(data) : [];
    return connections.filter(c => !c.deleted).sort((a, b) =>
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }

  async getConnectionById(id: string): Promise<Connection | null> {
    const connections = await this.getConnections();
    return connections.find(c => c.id === id) || null;
  }

  async getAllConnectionsIncludingDeleted(): Promise<Connection[]> {
    const data = await AsyncStorage.getItem(STORAGE_KEYS.CONNECTIONS);
    return data ? JSON.parse(data) : [];
  }

  async deleteConnection(id: string): Promise<void> {
    const connections = await this.getAllConnectionsIncludingDeleted();
    const index = connections.findIndex(c => c.id === id);
    if (index >= 0) {
      connections[index] = {
        ...connections[index],
        deleted: true,
        synced: false,
        updatedAt: new Date().toISOString()
      };
      await AsyncStorage.setItem(STORAGE_KEYS.CONNECTIONS, JSON.stringify(connections));
      console.log('Connection marked as deleted:', id);
    }
  }

  // Get all memories that have a specific connection tagged
  async getMemoriesByConnection(connectionId: string): Promise<LocalMemory[]> {
    const memories = await this.getMemories();
    return memories.filter(m =>
      m.mentionedConnections && m.mentionedConnections.includes(connectionId)
    );
  }

  // Phase 3.3: Update copilot summary fields (smart-cache, avoids full connection rewrite)
  async updateConnectionCopilotSummary(
    connectionId: string,
    summary: string,
    memoryCount: number
  ): Promise<void> {
    const connections = await this.getAllConnectionsIncludingDeleted();
    const index = connections.findIndex(c => c.id === connectionId);
    if (index >= 0) {
      connections[index] = {
        ...connections[index],
        copilotSummary: summary,
        copilotSummaryUpdatedAt: new Date().toISOString(),
        copilotSummaryMemoryCount: memoryCount,
      };
      await AsyncStorage.setItem(STORAGE_KEYS.CONNECTIONS, JSON.stringify(connections));
    }
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
