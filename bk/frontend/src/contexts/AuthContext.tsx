import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import * as Google from 'expo-auth-session/providers/google';
import * as WebBrowser from 'expo-web-browser';
import { makeRedirectUri, ResponseType } from 'expo-auth-session';
import { localStorage, LocalUser } from '../services/LocalStorage';
import { googleDriveSync } from '../services/GoogleDriveSync';
import { GOOGLE_CONFIG } from '../config/google';
import { Platform } from 'react-native';

WebBrowser.maybeCompleteAuthSession();

interface AuthContextType {
  user: LocalUser | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  isAdmin: boolean;
  accessToken: string | null;
  signInWithGoogle: () => Promise<void>;
  signInAsAdmin: (username: string, password: string) => Promise<{ success: boolean; message: string }>;
  signOut: () => Promise<void>;
  syncWithDrive: () => Promise<{ success: boolean; message: string }>;
  syncStatus: {
    lastSync: string | null;
    pendingChanges: number;
    isSyncing: boolean;
  };
  refreshSyncStatus: () => Promise<void>;
  completeOnboarding: (data: { name: string; birthDate: string; goal: string }) => Promise<void>;
  addAvatarXP: (amount: number) => Promise<void>;
  completeDailyChallenge: (challengeText?: string) => Promise<void>;
  resetDailyChallenges: () => Promise<void>;
  updateStoragePreference: (pref: 'both' | 'text_only') => Promise<void>;
  restoreMemory: (id: string) => Promise<void>;
  permanentlyDeleteMemory: (id: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<LocalUser | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [syncStatus, setSyncStatus] = useState({
    lastSync: null as string | null,
    pendingChanges: 0,
    isSyncing: false,
  });

  // Use Expo's auth proxy for web to avoid CORS issues
  const useProxy = Platform.OS === 'web';

  const redirectUri = makeRedirectUri({
    scheme: 'com.diariodevoz.app',
  });

  console.log('OAuth Redirect URI:', redirectUri, 'useProxy:', useProxy);

  // Google Auth configuration
  const [request, response, promptAsync] = Google.useAuthRequest({
    iosClientId: GOOGLE_CONFIG.iosClientId,
    androidClientId: GOOGLE_CONFIG.androidClientId,
    webClientId: GOOGLE_CONFIG.webClientId,
    scopes: GOOGLE_CONFIG.scopes,
    responseType: ResponseType.Token,
  });

  // Load user from local storage on mount
  useEffect(() => {
    loadStoredUser();
  }, []);

  // Handle Google auth response
  useEffect(() => {
    if (response?.type === 'success') {
      const { authentication } = response;
      if (authentication?.accessToken) {
        handleGoogleSignIn(authentication.accessToken);
      }
    }
  }, [response]);

  const loadStoredUser = async () => {
    try {
      const storedUser = await localStorage.getUser();
      const storedToken = await localStorage.getGoogleToken();

      if (storedUser && storedToken) {
        setUser(storedUser);
        setAccessToken(storedToken);

        // Check if this is an admin user
        if (storedUser.googleId === 'admin' || storedUser.id === 'admin_001') {
          setIsAdmin(true);
        }

        googleDriveSync.setAccessToken(storedToken);

        // Refresh sync status
        const status = await localStorage.getSyncStatus();
        setSyncStatus(status);
      }
    } catch (error) {
      console.error('Error loading stored user:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleSignIn = async (token: string) => {
    try {
      setIsLoading(true);

      // Get user info from Google
      const userInfoResponse = await fetch(
        'https://www.googleapis.com/userinfo/v2/me',
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      if (!userInfoResponse.ok) {
        throw new Error('Failed to get user info');
      }

      const googleUser = await userInfoResponse.json();

      // Create local user
      const localUser: LocalUser = {
        id: googleUser.id,
        email: googleUser.email,
        name: googleUser.name,
        photo: googleUser.picture,
        googleId: googleUser.id,
        createdAt: new Date().toISOString(),
      };

      // Save user and token locally
      await localStorage.saveUser(localUser);
      await localStorage.saveGoogleToken(token);

      setUser(localUser);
      setAccessToken(token);
      googleDriveSync.setAccessToken(token);

      // Try to restore data from Drive
      const driveData = await googleDriveSync.downloadData();
      if (driveData && driveData.memories.length > 0) {
        await localStorage.importMemories(driveData.memories);
        await localStorage.setLastSync(driveData.lastUpdated);
      }

      // Refresh sync status
      const status = await localStorage.getSyncStatus();
      setSyncStatus(status);

    } catch (error) {
      console.error('Google sign-in error:', error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  const signInWithGoogle = async () => {
    try {
      await promptAsync();
    } catch (error) {
      console.error('Error prompting Google sign-in:', error);
      throw error;
    }
  };

  const signInAsAdmin = async (username: string, password: string) => {
    try {
      // FOR TESTING: Accept ANY credentials for admin login due to Tunnel blockers
      if (!username || !password) {
        return { success: false, message: 'Digite qualquer usuário e senha.' };
      }

      const adminUser: LocalUser = {
        id: 'admin_001',
        email: 'admin@diariodevoz.app',
        name: 'Administrador (Local)',
        googleId: 'admin',
        createdAt: new Date().toISOString(),
      };

      const fakeToken = "mock_admin_token_" + Date.now();

      await localStorage.saveUser(adminUser);
      await localStorage.saveGoogleToken(fakeToken);

      setUser(adminUser);
      setAccessToken(fakeToken);
      setIsAdmin(true);

      return { success: true, message: 'Login realizado com sucesso em Modo Offline!' };
      /*
      setIsLoading(true);

      const backendUrl = process.env.EXPO_PUBLIC_BACKEND_URL || '';
      const response = await fetch(`${backendUrl}/api/auth/admin/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ username, password }),
      });

      if (!response.ok) {
        // Try to get JSON error, but fallback if it's not JSON (like an HTML error page)
        let errorMessage = 'Usuário ou senha incorretos';
        const contentType = response.headers.get('content-type');

        if (contentType && contentType.includes('application/json')) {
          try {
            const errorData = await response.json();
            errorMessage = errorData.detail || errorMessage;
          } catch (e) {
            console.error('Failed to parse error fully:', e);
          }
        }
        return { success: false, message: errorMessage };
      }

      const contentType = response.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
        return { success: false, message: 'O servidor retornou uma resposta inválida. Verifique o URL do backend.' };
      }

      const data = await response.json();

      // Create admin user object
      const adminUser: LocalUser = {
        id: data.user.id,
        email: data.user.email,
        name: data.user.name,
        googleId: 'admin',
        createdAt: data.user.created_at,
      };

      // Save user locally
      await localStorage.saveUser(adminUser);
      await localStorage.saveGoogleToken(data.access_token);

      setUser(adminUser);
      setAccessToken(data.access_token);
      setIsAdmin(true);

      return { success: true, message: 'Login realizado com sucesso!' };
      */
    } catch (error) {
      console.error('Admin sign-in error:', error);
      return { success: false, message: 'Erro ao conectar. Tente novamente.' };
    } finally {
      setIsLoading(false);
    }
  };

  const signOut = async () => {
    try {
      setIsLoading(true);
      await localStorage.clearUser();
      await localStorage.clearGoogleToken();
      setUser(null);
      setAccessToken(null);
      setIsAdmin(false);
      setSyncStatus({ lastSync: null, pendingChanges: 0, isSyncing: false });
    } catch (error) {
      console.error('Error signing out:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const syncWithDrive = async () => {
    if (!accessToken) {
      return { success: false, message: 'Não autenticado' };
    }

    setSyncStatus(prev => ({ ...prev, isSyncing: true }));

    try {
      googleDriveSync.setAccessToken(accessToken);
      const result = await googleDriveSync.sync();

      // Refresh sync status
      const status = await localStorage.getSyncStatus();
      setSyncStatus({ ...status, isSyncing: false });

      return result;
    } catch (error) {
      console.error('Sync error:', error);
      setSyncStatus(prev => ({ ...prev, isSyncing: false }));
      return { success: false, message: 'Erro na sincronização' };
    }
  };

  const refreshSyncStatus = async () => {
    const status = await localStorage.getSyncStatus();
    setSyncStatus(status);
  };

  const completeOnboarding = async (data: { name: string; birthDate: string; goal: string }) => {
    if (!user) return;
    const updatedUser = {
      ...user,
      name: data.name,
      birthDate: data.birthDate,
      userGoal: data.goal,
      hasCompletedOnboarding: true,
      avatarLevel: user.avatarLevel || 1,
      avatarXP: user.avatarXP || 0,
    };
    await localStorage.saveUser(updatedUser);
    setUser(updatedUser);
  };

  const addAvatarXP = async (amount: number) => {
    if (!user) return;
    const currentXP = user.avatarXP || 0;
    const newXP = currentXP + amount;
    // Calculate new level
    const newLevel = Math.max(1, Math.floor(Math.pow(newXP / 50, 0.6)) + 1);

    const updatedUser = {
      ...user,
      avatarXP: newXP,
      avatarLevel: newLevel,
    };
    await localStorage.saveUser(updatedUser);
    setUser(updatedUser);
  };

  const completeDailyChallenge = async (challengeText?: string) => {
    if (!user) return;
    const now = new Date();

    // check if it's a new day to reset today's challenges
    const isToday = (dateString: string) => {
      const d = new Date(dateString);
      return d.toDateString() === now.toDateString();
    };

    let completedToday = user.completedDailyChallenges || [];
    if (user.lastChallengeCompletedAt && !isToday(user.lastChallengeCompletedAt)) {
      completedToday = [];
    }

    if (challengeText && !completedToday.includes(challengeText)) {
      completedToday.push(challengeText);
    }

    // Update all-time history
    const history = user.allTimeCompletedChallenges || [];
    if (challengeText && !history.some((h: any) => h.text === challengeText)) {
      history.push({
        text: challengeText,
        completedAt: now.toISOString(),
        emoji: '⭐' // Fallback emoji
      });
    }

    const updatedUser = {
      ...user,
      lastChallengeCompletedAt: now.toISOString(),
      completedDailyChallenges: completedToday,
      allTimeCompletedChallenges: history,
    };
    await localStorage.saveUser(updatedUser);
    setUser(updatedUser);
  };

  const resetDailyChallenges = async () => {
    if (!user) return;
    const updatedUser = {
      ...user,
      lastChallengeCompletedAt: undefined,
      completedDailyChallenges: [],
    };
    await localStorage.saveUser(updatedUser);
    setUser(updatedUser);
  };

  const updateStoragePreference = async (pref: 'both' | 'text_only') => {
    if (!user) return;
    const updatedUser = { ...user, storagePreference: pref };
    await localStorage.saveUser(updatedUser);
    setUser(updatedUser);
  };

  const restoreMemory = async (id: string) => {
    await localStorage.restoreMemory(id);
  };

  const permanentlyDeleteMemory = async (id: string) => {
    await localStorage.permanentlyDeleteMemory(id);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        isAuthenticated: !!user,
        isAdmin,
        accessToken,
        signInWithGoogle,
        signInAsAdmin,
        signOut,
        syncWithDrive,
        syncStatus,
        refreshSyncStatus,
        completeOnboarding,
        addAvatarXP,
        completeDailyChallenge,
        resetDailyChallenges,
        updateStoragePreference,
        restoreMemory,
        permanentlyDeleteMemory,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
