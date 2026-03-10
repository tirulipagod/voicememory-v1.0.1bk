import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Animated } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../src/contexts/AuthContext';

const GOALS = [
    { id: 'self_awareness', title: 'Autoconhecimento', icon: 'compass-outline', desc: 'Entender meus padrões e pensamentos.' },
    { id: 'venting', title: 'Desabafo', icon: 'chatbubbles-outline', desc: 'Um espaço seguro para falar sem julgamentos.' },
    { id: 'legacy', title: 'Legado e Memórias', icon: 'library-outline', desc: 'Documentar a minha história para o futuro.' },
    { id: 'anxiety', title: 'Reduzir Ansiedade', icon: 'leaf-outline', desc: 'Esvaziar a mente antes de dormir ou trabalhar.' },
    { id: 'other', title: 'Outro', icon: 'star-outline', desc: 'Tenho um objetivo pessoal diferente.' },
];

export default function WelcomeScreen() {
    const { completeOnboarding, user } = useAuth();
    const [step, setStep] = useState(user?.hasCompletedOnboarding ? 2 : 1);
    const [selectedGoal, setSelectedGoal] = useState(user?.userGoal || '');
    const fadeAnim = React.useRef(new Animated.Value(0)).current;

    React.useEffect(() => {
        Animated.timing(fadeAnim, {
            toValue: 1,
            duration: 800,
            useNativeDriver: true,
        }).start();
    }, [step]);

    const handleNext = () => {
        fadeAnim.setValue(0);
        setStep(2);
    };

    const handleComplete = async () => {
        if (!selectedGoal) return; // For optimization maybe show an alert
        await completeOnboarding(selectedGoal);
        router.replace('/(tabs)');
    };

    return (
        <SafeAreaView style={styles.container}>
            <Animated.View style={[styles.content, { opacity: fadeAnim }]}>
                {step === 1 ? (
                    <View style={styles.stepContainer}>
                        <Ionicons name="mic-circle" size={80} color="#8b5cf6" style={styles.icon} />
                        <Text style={styles.title}>Bem-vindo(a) ao VoiceMemory</Text>
                        <Text style={styles.subtitle}>Não somos apenas um aplicativo de gravação. Somos o seu companheiro para a vida mental e seu relicário de sabedoria.</Text>

                        <View style={styles.privacyBox}>
                            <Ionicons name="shield-checkmark" size={24} color="#10b981" />
                            <Text style={styles.privacyText}>
                                As suas memórias são <Text style={{ fontWeight: 'bold' }}>100% locais e privadas</Text>. O aplicativo não minera dados e você é o mestre exclusivo de sua própria história com backup na sua nuvem.
                            </Text>
                        </View>

                        <View style={styles.spacer} />
                        <TouchableOpacity style={styles.primaryButton} onPress={handleNext}>
                            <Text style={styles.primaryButtonText}>Começar a Jornada</Text>
                            <Ionicons name="arrow-forward" size={20} color="#fff" />
                        </TouchableOpacity>
                    </View>
                ) : (
                    <View style={styles.stepContainer}>
                        <Text style={styles.title}>Qual é o seu propósito?</Text>
                        <Text style={styles.subtitle}>O seu Companheiro de IA e os seus Descartes Diários serão moldados em torno dessa escolha central.</Text>

                        <ScrollView style={styles.goalsList} showsVerticalScrollIndicator={false}>
                            {GOALS.map((goal) => (
                                <TouchableOpacity
                                    key={goal.id}
                                    style={[
                                        styles.goalCard,
                                        selectedGoal === goal.id && styles.goalCardActive
                                    ]}
                                    onPress={() => setSelectedGoal(goal.id)}
                                >
                                    <Ionicons
                                        name={goal.icon as any}
                                        size={28}
                                        color={selectedGoal === goal.id ? '#8b5cf6' : '#9ca3af'}
                                    />
                                    <View style={styles.goalTextContainer}>
                                        <Text style={[styles.goalTitle, selectedGoal === goal.id && styles.goalTitleActive]}>
                                            {goal.title}
                                        </Text>
                                        <Text style={styles.goalDesc}>{goal.desc}</Text>
                                    </View>
                                </TouchableOpacity>
                            ))}
                        </ScrollView>

                        <TouchableOpacity
                            style={[styles.primaryButton, !selectedGoal && styles.primaryButtonDisabled]}
                            onPress={handleComplete}
                            disabled={!selectedGoal}
                        >
                            <Text style={styles.primaryButtonText}>Finalizar Configuração</Text>
                            <Ionicons name="checkmark-done" size={20} color="#fff" />
                        </TouchableOpacity>
                    </View>
                )}
            </Animated.View>
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
        padding: 24,
    },
    stepContainer: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
    },
    icon: {
        marginBottom: 24,
    },
    title: {
        fontSize: 28,
        fontWeight: 'bold',
        color: '#f3f4f6',
        textAlign: 'center',
        marginBottom: 16,
    },
    subtitle: {
        fontSize: 16,
        color: '#9ca3af',
        textAlign: 'center',
        lineHeight: 24,
        marginBottom: 32,
    },
    privacyBox: {
        flexDirection: 'row',
        backgroundColor: 'rgba(16, 185, 129, 0.1)',
        padding: 16,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: 'rgba(16, 185, 129, 0.2)',
        alignItems: 'center',
        gap: 12,
    },
    privacyText: {
        flex: 1,
        color: '#d1d5db',
        lineHeight: 20,
        fontSize: 14,
    },
    spacer: {
        flex: 1,
    },
    goalsList: {
        width: '100%',
        marginBottom: 20,
    },
    goalCard: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 16,
        backgroundColor: '#1f2937',
        borderRadius: 16,
        marginBottom: 12,
        borderWidth: 2,
        borderColor: 'transparent',
        gap: 16,
    },
    goalCardActive: {
        borderColor: '#8b5cf6',
        backgroundColor: 'rgba(139, 92, 246, 0.1)',
    },
    goalTextContainer: {
        flex: 1,
    },
    goalTitle: {
        fontSize: 16,
        fontWeight: '600',
        color: '#d1d5db',
        marginBottom: 4,
    },
    goalTitleActive: {
        color: '#f3f4f6',
    },
    goalDesc: {
        fontSize: 14,
        color: '#9ca3af',
    },
    primaryButton: {
        width: '100%',
        backgroundColor: '#8b5cf6',
        padding: 16,
        borderRadius: 999,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
    },
    primaryButtonDisabled: {
        backgroundColor: '#4b5563',
        opacity: 0.7,
    },
    primaryButtonText: {
        color: '#ffffff',
        fontSize: 16,
        fontWeight: 'bold',
    },
});
