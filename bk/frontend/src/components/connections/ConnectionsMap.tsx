import React, { useRef, useState, useEffect } from 'react';
import {
    View,
    Text,
    StyleSheet,
    Dimensions,
    Animated,
    PanResponder,
    TouchableOpacity,
    Image
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Connection } from '../../services/LocalStorage';

const { width, height } = Dimensions.get('window');
const MAP_WIDTH = width * 2;
const MAP_HEIGHT = height * 2;
const NODE_SIZE = 80;

interface ConnectionsMapProps {
    connections: Connection[];
    onNodePress: (connection: Connection) => void;
    onAddPress: () => void;
}

export default function ConnectionsMap({ connections, onNodePress, onAddPress }: ConnectionsMapProps) {
    // Posicionamento do mapa (Panning)
    const pan = useRef(new Animated.ValueXY({
        x: -(MAP_WIDTH - width) / 2, // Inicia centralizado
        y: -(MAP_HEIGHT - height) / 2
    })).current;

    const panResponder = useRef(
        PanResponder.create({
            onMoveShouldSetPanResponder: (_, gestureState) => {
                // Apenas assume o pan se o movimento for significativo
                return Math.abs(gestureState.dx) > 10 || Math.abs(gestureState.dy) > 10;
            },
            onPanResponderGrant: () => {
                pan.setOffset({
                    x: (pan.x as any)._value,
                    y: (pan.y as any)._value
                });
                pan.setValue({ x: 0, y: 0 });
            },
            onPanResponderMove: Animated.event(
                [null, { dx: pan.x, dy: pan.y }],
                { useNativeDriver: false }
            ),
            onPanResponderRelease: () => {
                pan.flattenOffset();

                // Limites do mapa (Bounce back se sair da tela)
                let newX = (pan.x as any)._value;
                let newY = (pan.y as any)._value;

                let outOfBounds = false;

                if (newX > 0) { newX = 0; outOfBounds = true; }
                if (newX < -(MAP_WIDTH - width)) { newX = -(MAP_WIDTH - width); outOfBounds = true; }

                if (newY > 0) { newY = 0; outOfBounds = true; }
                if (newY < -(MAP_HEIGHT - height)) { newY = -(MAP_HEIGHT - height); outOfBounds = true; }

                if (outOfBounds) {
                    Animated.spring(pan, {
                        toValue: { x: newX, y: newY },
                        useNativeDriver: false,
                        friction: 7
                    }).start();
                }
            }
        })
    ).current;

    // Calculando posições dos nós de forma circular/aleatória baseada no centro
    const [nodePositions, setNodePositions] = useState<Record<string, { x: number, y: number }>>({});

    useEffect(() => {
        const centerX = MAP_WIDTH / 2;
        const centerY = MAP_HEIGHT / 2;

        const newPositions: Record<string, { x: number, y: number }> = {};

        // O usuário sempre no centro (nó principal implícito ou explícito nas linhas)

        connections.forEach((conn, index) => {
            // Espalhamento em órbitas
            const orbitLayer = Math.floor(index / 6) + 1; // De 6 em 6 nós criam uma nova camada de órbita
            const radius = orbitLayer * 140;

            const angle = (index % 6) * (Math.PI * 2 / 6) + (Math.random() * 0.5); // Adiciona um pouco de aleatoriedade

            newPositions[conn.id] = {
                x: centerX + Math.cos(angle) * radius - (NODE_SIZE / 2),
                y: centerY + Math.sin(angle) * radius - (NODE_SIZE / 2)
            };
        });

        setNodePositions(newPositions);
    }, [connections]);

    const centerX = MAP_WIDTH / 2;
    const centerY = MAP_HEIGHT / 2;

    // Renderização das linhas de conexão para o centro
    const renderLines = () => {
        return connections.map(conn => {
            const pos = nodePositions[conn.id];
            if (!pos) return null;

            // Centro do nó da pessoa
            const nodeCenterX = pos.x + NODE_SIZE / 2;
            const nodeCenterY = pos.y + NODE_SIZE / 2;

            // Usando SVG para desenhar linhas no futuro seria o ideal para React Native web/mobile
            // Como aproximação apenas com Views (Transform):

            const dx = nodeCenterX - centerX;
            const dy = nodeCenterY - centerY;
            const length = Math.sqrt(dx * dx + dy * dy);
            const angle = Math.atan2(dy, dx) * 180 / Math.PI;

            return (
                <View
                    key={`line-${conn.id}`}
                    style={{
                        position: 'absolute',
                        left: centerX,
                        top: centerY - 1, // Meia espessura
                        width: length,
                        height: 2,
                        backgroundColor: 'rgba(139, 92, 246, 0.3)',
                        transform: [
                            { translateX: 0 },
                            { translateY: 0 },
                            { rotate: `${angle}deg` },
                            { translateX: length / 2 - length / 2 } // Ajuste do anchor point (ponta da linha vs meio)
                        ],
                        transformOrigin: '0% 50%' // Importante para rotacionar pela base
                    }}
                />
            );
        });
    };

    return (
        <View style={styles.container}>
            <Animated.View
                style={[
                    styles.map,
                    {
                        transform: [{ translateX: pan.x }, { translateY: pan.y }]
                    }
                ]}
                {...panResponder.panHandlers}
            >
                {/* Camada de Fundo Estrelado/Conexões */}
                <View style={styles.backgroundGrid} />

                {/* Linhas */}
                {renderLines()}

                {/* Nó Central (Usuário) */}
                <View
                    style={[
                        styles.centralNode,
                        { left: centerX - 45, top: centerY - 45 }
                    ]}
                >
                    <Ionicons name="person" size={40} color="#fff" />
                    <View style={styles.centralNodePulse} />
                </View>
                <Text style={[styles.nodeLabel, { left: centerX - 50, top: centerY + 50, textAlign: 'center', width: 100 }]}>
                    Você
                </Text>

                {/* Nós das Pessoas */}
                {connections.map((conn) => {
                    const pos = nodePositions[conn.id];
                    if (!pos) return null;

                    return (
                        <TouchableOpacity
                            key={conn.id}
                            style={[
                                styles.node,
                                { left: pos.x, top: pos.y }
                            ]}
                            onPress={() => onNodePress(conn)}
                            activeOpacity={0.7}
                        >
                            <View style={styles.nodeImageContainer}>
                                {conn.photoUri ? (
                                    <Image source={{ uri: conn.photoUri }} style={styles.nodeImage} />
                                ) : (
                                    <Ionicons name="person" size={36} color="#a78bfa" />
                                )}

                                {/* Indicador de Memória de Assinatura */}
                                {conn.signatureMemoryId && (
                                    <View style={styles.signatureBadge}>
                                        <Ionicons name="play" size={12} color="#fff" />
                                    </View>
                                )}
                            </View>

                            <Text style={styles.nodeName} numberOfLines={1}>{conn.name}</Text>
                            <Text style={styles.nodeRelation}>{conn.relationship}</Text>
                        </TouchableOpacity>
                    );
                })}

            </Animated.View>

            {/* Floating Action Button para Adicionar */}
            <TouchableOpacity
                style={styles.fab}
                onPress={onAddPress}
                activeOpacity={0.8}
            >
                <Ionicons name="add" size={32} color="#fff" />
            </TouchableOpacity>

            {/* Instrução flutuante */}
            <View style={styles.tooltip}>
                <Ionicons name="hand-left-outline" size={16} color="#d1d5db" />
                <Text style={styles.tooltipText}>Arraste para explorar suas conexões</Text>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        overflow: 'hidden',
        backgroundColor: '#0a0a0f',
    },
    map: {
        width: MAP_WIDTH,
        height: MAP_HEIGHT,
        backgroundColor: '#0a0a0f',
    },
    backgroundGrid: {
        ...StyleSheet.absoluteFillObject,
        opacity: 0.1,
        // Efeito radial gradiente ou grid stars
    },
    centralNode: {
        position: 'absolute',
        width: 90,
        height: 90,
        borderRadius: 45,
        backgroundColor: '#8b5cf6',
        alignItems: 'center',
        justifyContent: 'center',
        shadowColor: '#8b5cf6',
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.8,
        shadowRadius: 20,
        elevation: 10,
        zIndex: 10,
    },
    centralNodePulse: {
        position: 'absolute',
        width: 110,
        height: 110,
        borderRadius: 55,
        borderWidth: 1,
        borderColor: 'rgba(139, 92, 246, 0.4)',
        borderStyle: 'dashed',
    },
    node: {
        position: 'absolute',
        width: NODE_SIZE,
        alignItems: 'center',
        zIndex: 5,
    },
    nodeImageContainer: {
        width: 64,
        height: 64,
        borderRadius: 32,
        backgroundColor: '#1a1a24',
        borderWidth: 2,
        borderColor: '#4c1d95',
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 6,
        overflow: 'hidden',
    },
    nodeImage: {
        width: '100%',
        height: '100%',
    },
    signatureBadge: {
        position: 'absolute',
        bottom: -2,
        right: -2,
        backgroundColor: '#10b981',
        width: 22,
        height: 22,
        borderRadius: 11,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 2,
        borderColor: '#0a0a0f',
    },
    nodeName: {
        color: '#fff',
        fontSize: 14,
        fontWeight: '600',
        textAlign: 'center',
    },
    nodeRelation: {
        color: '#9ca3af',
        fontSize: 11,
        textAlign: 'center',
    },
    nodeLabel: {
        position: 'absolute',
        color: '#e5e7eb',
        fontSize: 16,
        fontWeight: 'bold',
    },
    fab: {
        position: 'absolute',
        bottom: 30,
        right: 30,
        width: 60,
        height: 60,
        borderRadius: 30,
        backgroundColor: '#8b5cf6',
        alignItems: 'center',
        justifyContent: 'center',
        shadowColor: '#8b5cf6',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.5,
        shadowRadius: 10,
        elevation: 8,
    },
    tooltip: {
        position: 'absolute',
        top: 20,
        alignSelf: 'center',
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(26, 26, 36, 0.8)',
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderRadius: 20,
        gap: 8,
    },
    tooltipText: {
        color: '#d1d5db',
        fontSize: 12,
    }
});
