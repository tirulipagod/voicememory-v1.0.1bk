import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Dimensions,
  TextInput,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../src/contexts/AuthContext';
import { router } from 'expo-router';

const { width } = Dimensions.get('window');

export default function LoginScreen() {
  const { signInWithGoogle, signInAsAdmin, isLoading, isAuthenticated } = useAuth();
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [showAdminLogin, setShowAdminLogin] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // Redirect if already authenticated
  useEffect(() => {
    if (isAuthenticated) {
      router.replace('/(tabs)/');
    }
  }, [isAuthenticated]);

  const handleGoogleSignIn = async () => {
    try {
      setIsSigningIn(true);
      await signInWithGoogle();
    } catch (error) {
      console.error('Sign in error:', error);
    } finally {
      setIsSigningIn(false);
    }
  };

  const handleAdminSignIn = async () => {
    if (!username.trim() || !password.trim()) {
      Alert.alert('Erro', 'Preencha usuário e senha');
      return;
    }

    try {
      setIsSigningIn(true);
      const result = await signInAsAdmin(username.trim(), password);
      
      if (!result.success) {
        Alert.alert('Erro', result.message);
      }
    } catch (error) {
      console.error('Admin sign in error:', error);
      Alert.alert('Erro', 'Falha ao fazer login');
    } finally {
      setIsSigningIn(false);
    }
  };

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#8b5cf6" />
          <Text style={styles.loadingText}>Entrando...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
          <View style={styles.content}>
            {/* Hero Section */}
            <View style={styles.heroSection}>
              <View style={styles.iconContainer}>
                <Ionicons name="mic" size={48} color="#fff" />
              </View>
              
              <Text style={styles.title}>Diário de Voz</Text>
              <Text style={styles.subtitle}>Suas memórias, sua voz, sua história</Text>
            </View>

            {showAdminLogin ? (
              /* Admin Login Form */
              <View style={styles.adminLoginSection}>
                <Text style={styles.adminLoginTitle}>Login Administrador</Text>
                
                <View style={styles.inputContainer}>
                  <Ionicons name="person-outline" size={20} color="#6b7280" style={styles.inputIcon} />
                  <TextInput
                    style={styles.input}
                    placeholder="Usuário"
                    placeholderTextColor="#6b7280"
                    value={username}
                    onChangeText={setUsername}
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                </View>

                <View style={styles.inputContainer}>
                  <Ionicons name="lock-closed-outline" size={20} color="#6b7280" style={styles.inputIcon} />
                  <TextInput
                    style={styles.input}
                    placeholder="Senha"
                    placeholderTextColor="#6b7280"
                    value={password}
                    onChangeText={setPassword}
                    secureTextEntry={!showPassword}
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                  <TouchableOpacity onPress={() => setShowPassword(!showPassword)}>
                    <Ionicons name={showPassword ? "eye-off-outline" : "eye-outline"} size={20} color="#6b7280" />
                  </TouchableOpacity>
                </View>

                <TouchableOpacity 
                  style={[styles.adminLoginButton, isSigningIn && styles.buttonDisabled]}
                  onPress={handleAdminSignIn}
                  disabled={isSigningIn}
                >
                  {isSigningIn ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <>
                      <Ionicons name="log-in-outline" size={20} color="#fff" />
                      <Text style={styles.adminLoginButtonText}>Entrar</Text>
                    </>
                  )}
                </TouchableOpacity>

                <TouchableOpacity 
                  style={styles.backToMainButton}
                  onPress={() => {
                    setShowAdminLogin(false);
                    setUsername('');
                    setPassword('');
                  }}
                >
                  <Text style={styles.backToMainText}>Voltar para login principal</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <>
                {/* Features */}
                <View style={styles.featuresSection}>
                  <View style={styles.feature}>
                    <View style={[styles.featureIcon, { backgroundColor: 'rgba(139, 92, 246, 0.1)' }]}>
                      <Ionicons name="shield-checkmark" size={20} color="#8b5cf6" />
                    </View>
                    <View style={styles.featureText}>
                      <Text style={styles.featureTitle}>100% Privado</Text>
                      <Text style={styles.featureDescription}>Seus dados ficam no seu Google Drive</Text>
                    </View>
                  </View>

                  <View style={styles.feature}>
                    <View style={[styles.featureIcon, { backgroundColor: 'rgba(16, 185, 129, 0.1)' }]}>
                      <Ionicons name="cloud-done" size={20} color="#10b981" />
                    </View>
                    <View style={styles.featureText}>
                      <Text style={styles.featureTitle}>Backup Automático</Text>
                      <Text style={styles.featureDescription}>Sincroniza automaticamente com a nuvem</Text>
                    </View>
                  </View>

                  <View style={styles.feature}>
                    <View style={[styles.featureIcon, { backgroundColor: 'rgba(245, 158, 11, 0.1)' }]}>
                      <Ionicons name="sparkles" size={20} color="#f59e0b" />
                    </View>
                    <View style={styles.featureText}>
                      <Text style={styles.featureTitle}>IA que te entende</Text>
                      <Text style={styles.featureDescription}>Analisa emoções e cria seu perfil vivo</Text>
                    </View>
                  </View>
                </View>

                {/* Sign In Button */}
                <View style={styles.authSection}>
                  <TouchableOpacity 
                    style={styles.googleButton}
                    onPress={handleGoogleSignIn}
                    activeOpacity={0.8}
                    disabled={isSigningIn}
                  >
                    {isSigningIn ? (
                      <ActivityIndicator size="small" color="#374151" />
                    ) : (
                      <>
                        <View style={styles.googleIconContainer}>
                          <Text style={styles.googleIconText}>G</Text>
                        </View>
                        <Text style={styles.googleButtonText}>Entrar com Google</Text>
                      </>
                    )}
                  </TouchableOpacity>

                  <Text style={styles.privacyNote}>
                    Ao entrar, você concorda que suas memórias serão{'\n'}
                    armazenadas apenas no seu Google Drive pessoal.
                  </Text>
                </View>

                {/* Admin Login Link */}
                <TouchableOpacity 
                  style={styles.adminLinkButton}
                  onPress={() => setShowAdminLogin(true)}
                >
                  <Ionicons name="shield-outline" size={16} color="#6b7280" />
                  <Text style={styles.adminLinkText}>Login Administrador</Text>
                </TouchableOpacity>
              </>
            )}

            {/* Footer */}
            <View style={styles.footer}>
              <Text style={styles.footerText}>
                Seus dados. Seu controle. Sua privacidade.
              </Text>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a0f',
  },
  scrollContent: {
    flexGrow: 1,
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
  content: {
    flex: 1,
    paddingHorizontal: 24,
    justifyContent: 'center',
    paddingVertical: 40,
  },
  heroSection: {
    alignItems: 'center',
    marginBottom: 48,
  },
  iconContainer: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: '#8b5cf6',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#9ca3af',
    textAlign: 'center',
  },
  featuresSection: {
    marginBottom: 48,
    gap: 16,
  },
  feature: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1a1a24',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#2d2d3a',
  },
  featureIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  featureText: {
    flex: 1,
  },
  featureTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 2,
  },
  featureDescription: {
    fontSize: 13,
    color: '#6b7280',
  },
  authSection: {
    alignItems: 'center',
    marginBottom: 32,
  },
  googleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 14,
    width: '100%',
  },
  googleIconContainer: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    marginRight: 12,
  },
  googleIconText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#4285F4',
  },
  googleButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#374151',
  },
  privacyNote: {
    fontSize: 12,
    color: '#6b7280',
    textAlign: 'center',
    marginTop: 16,
    lineHeight: 18,
  },
  footer: {
    alignItems: 'center',
  },
  footerText: {
    fontSize: 13,
    color: '#4b5563',
    textAlign: 'center',
  },
  // Admin Login Styles
  adminLinkButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    marginBottom: 24,
  },
  adminLinkText: {
    fontSize: 13,
    color: '#6b7280',
  },
  adminLoginSection: {
    marginBottom: 32,
  },
  adminLoginTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#fff',
    textAlign: 'center',
    marginBottom: 24,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1a1a24',
    borderRadius: 12,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: '#2d2d3a',
    marginBottom: 16,
  },
  inputIcon: {
    marginRight: 12,
  },
  input: {
    flex: 1,
    paddingVertical: 16,
    fontSize: 16,
    color: '#fff',
  },
  adminLoginButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#8b5cf6',
    paddingVertical: 16,
    borderRadius: 12,
    gap: 8,
    marginTop: 8,
  },
  adminLoginButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  buttonDisabled: {
    backgroundColor: '#4b5563',
  },
  backToMainButton: {
    alignItems: 'center',
    paddingVertical: 16,
    marginTop: 8,
  },
  backToMainText: {
    fontSize: 14,
    color: '#8b5cf6',
  },
});
