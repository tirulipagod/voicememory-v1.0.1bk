import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Animated, Easing, TouchableOpacity, TouchableWithoutFeedback } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../contexts/AuthContext';
import { VideoMascot } from './VideoMascot';
import { router } from 'expo-router';

interface AvatarWidgetProps {
    onPressChallenge?: () => void;
    emotionColor?: string;
    emotionName?: string;
    onPressSettings?: () => void;
}

export const AvatarWidget = ({
    onPressChallenge,
    emotionColor = '#8b5cf6',
    emotionName = 'feliz',
    onPressSettings
}: AvatarWidgetProps) => {
    const { user } = useAuth();
    const xp = user?.avatarXP || 0;

    // Exponential difficulty curve for level mapping
    const currentLevel = Math.max(1, Math.floor(Math.pow(xp / 50, 0.6)) + 1);
    const nextLevel = currentLevel + 1;
    const xpForCurrentLevel = Math.ceil(50 * Math.pow(currentLevel - 1, 1 / 0.6));
    const xpForNextLevel = Math.ceil(50 * Math.pow(nextLevel - 1, 1 / 0.6));
    const progressToNextLevel = Math.max(0, Math.min(1, (xp - xpForCurrentLevel) / (xpForNextLevel - xpForCurrentLevel)));

    // Animations
    const pulseAnim = useRef(new Animated.Value(1)).current;

    const handleAvatarPress = () => {
        Animated.sequence([
            Animated.timing(pulseAnim, {
                toValue: 1.1,
                duration: 150,
                useNativeDriver: true,
            }),
            Animated.timing(pulseAnim, {
                toValue: 1,
                duration: 150,
                useNativeDriver: true,
            })
        ]).start();
    };

    return (
        <View style={styles.container}>
            <View style={styles.header}>
                <Text style={styles.title}>Companheiro de Jornada</Text>
                <View style={styles.headerRight}>
                    <View style={styles.levelBadge}>
                        <Text style={styles.levelText}>Lvl {currentLevel}</Text>
                    </View>
                    {/* Settings button, using the new onPressSettings prop */}
                    <TouchableOpacity
                        style={styles.configButton}
                        onPress={onPressSettings}
                    >
                        <Ionicons name="settings-outline" size={20} color="#9ca3af" />
                    </TouchableOpacity>
                </View>
            </View>

            <View style={styles.avatarSpace}>
                {/* Actual Alive Creature */}
                <TouchableWithoutFeedback onPress={handleAvatarPress}>
                    <Animated.View style={[
                        styles.avatarCore,
                        { transform: [{ scale: pulseAnim }] }
                    ]}>
                        <VideoMascot />
                    </Animated.View>
                </TouchableWithoutFeedback>
            </View>

            <View style={styles.xpSection}>
                <View style={styles.xpLabels}>
                    <Text style={styles.xpText}>{xp} XP totais</Text>
                    <Text style={styles.xpTextTarget}>Próximo: {xpForNextLevel} XP</Text>
                </View>
                <View style={styles.progressBarContainer}>
                    <View style={[styles.progressBarFill, { width: `${progressToNextLevel * 100}%`, backgroundColor: emotionColor }]} />
                </View>
            </View>

            {
                onPressChallenge && (
                    <TouchableOpacity style={styles.challengeButton} onPress={onPressChallenge}>
                        <Ionicons name="chatbubbles-outline" size={18} color="#9ca3af" />
                        <Text style={styles.challengeText}>Desafios Diários</Text>
                    </TouchableOpacity>
                )
            }
        </View >
    );
};

const styles = StyleSheet.create({
    container: {
        paddingVertical: 8,
        marginVertical: 8,
        position: 'relative',
        backgroundColor: 'transparent', // Transparent, no borders!
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 8, // Reduced space since we removed the float animation
    },
    title: {
        fontSize: 18,
        fontWeight: 'bold',
        color: '#f3f4f6',
    },
    headerRight: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
    },
    configButton: {
        padding: 4,
    },
    levelBadge: {
        backgroundColor: 'rgba(255,255,255,0.1)',
        paddingHorizontal: 12,
        paddingVertical: 4,
        borderRadius: 16,
    },
    levelText: {
        fontSize: 14,
        fontWeight: 'bold',
        color: '#f3f4f6',
    },
    avatarSpace: {
        height: 250,
        width: 250,
        alignSelf: 'center',
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 8,
    },
    glow: {
        position: 'absolute',
        width: 160,
        height: 160,
        borderRadius: 80,
        backgroundColor: '#fff', // Gets tinted by emotionColor via styled component
        shadowColor: '#fff',
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.5,
        shadowRadius: 30,
    },
    avatarCore: {
        width: 250,
        height: 250,
        alignItems: 'center',
        justifyContent: 'center',
        padding: 0,
    },
    xpSection: {
        marginBottom: 16,
    },
    xpLabels: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: 8,
    },
    xpText: {
        color: '#d1d5db',
        fontSize: 13,
        fontWeight: '600',
    },
    xpTextTarget: {
        color: '#9ca3af',
        fontSize: 12,
    },
    progressBarContainer: {
        height: 6,
        backgroundColor: '#374151',
        borderRadius: 3,
        overflow: 'hidden',
    },
    progressBarFill: {
        height: '100%',
        borderRadius: 3,
    },
    challengeButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 12,
        gap: 8,
    },
    challengeText: {
        fontSize: 14,
        color: '#9ca3af',
        fontWeight: '500',
    },
});
