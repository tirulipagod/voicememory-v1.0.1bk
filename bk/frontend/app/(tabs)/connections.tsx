import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { localStorage, Connection } from '../../src/services/LocalStorage';
import ConnectionsMap from '../../src/components/connections/ConnectionsMap';

export default function ConnectionsScreen() {
    const [connections, setConnections] = useState<Connection[]>([]);
    const [isAddModalVisible, setIsAddModalVisible] = useState(false);
    const [newName, setNewName] = useState('');
    const [newRelation, setNewRelation] = useState('');

    const [selectedConnection, setSelectedConnection] = useState<Connection | null>(null);
    const [connectionMemories, setConnectionMemories] = useState<any[]>([]);

    useEffect(() => {
        loadConnections();
    }, []);

    const loadConnections = async () => {
        const stored = await localStorage.getConnections();
        setConnections(stored);
    };

    const handleNodePress = async (connection: Connection) => {
        console.log('Pressed connection:', connection.name);
        setSelectedConnection(connection);

        // Load memories for this specific connection
        try {
            const memories = await localStorage.getMemoriesByConnection(connection.id);
            setConnectionMemories(memories);
        } catch (e) {
            console.error(e);
            setConnectionMemories([]);
        }
    };

    const closeNodeDetails = () => {
        setSelectedConnection(null);
        setConnectionMemories([]);
    };

    const handleAddPress = () => {
        setIsAddModalVisible(true);
    };

    const saveNewConnection = async () => {
        if (!newName.trim()) return;

        const newConn: Connection = {
            id: Date.now().toString(),
            userId: 'user', // Replace with actual user ID later
            name: newName.trim(),
            relationship: newRelation.trim() || 'Desconhecido',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            synced: false
        };

        await localStorage.saveConnection(newConn);
        setIsAddModalVisible(false);
        setNewName('');
        setNewRelation('');
        loadConnections();
    };

    return (
        <SafeAreaView style={styles.container} edges={['top']}>
            <View style={styles.header}>
                <Text style={styles.title}>Conexões</Text>
                <Text style={styles.subtitle}>Sua constelação de pessoas e memórias</Text>
            </View>

            <View style={styles.content}>
                <ConnectionsMap
                    connections={connections}
                    onNodePress={handleNodePress}
                    onAddPress={handleAddPress}
                />
            </View>

            {/* Connection Details BottomSheet */}
            <Modal
                visible={!!selectedConnection}
                animationType="slide"
                transparent={true}
                onRequestClose={closeNodeDetails}
            >
                <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={closeNodeDetails}>
                    <TouchableOpacity activeOpacity={1} onPress={(e) => e.stopPropagation()}>
                        <View style={[styles.modalContent, styles.detailsContent]}>
                            <View style={styles.modalDragIndicator} />

                            {selectedConnection && (
                                <>
                                    <View style={styles.detailsHeader}>
                                        <View style={styles.detailsAvatar}>
                                            <Ionicons name="person" size={40} color="#a78bfa" />
                                        </View>
                                        <View style={styles.detailsTitleContainer}>
                                            <Text style={styles.detailsName}>{selectedConnection.name}</Text>
                                            <Text style={styles.detailsRelationship}>{selectedConnection.relationship}</Text>
                                        </View>
                                        <TouchableOpacity style={styles.detailsCloseBtn} onPress={closeNodeDetails}>
                                            <Ionicons name="close-circle-outline" size={28} color="#6b7280" />
                                        </TouchableOpacity>
                                    </View>

                                    <View style={styles.detailsActionRow}>
                                        <TouchableOpacity style={styles.detailsActionButton}>
                                            <Ionicons name="mic-outline" size={20} color="#fff" />
                                            <Text style={styles.detailsActionText}>Gravar Memória</Text>
                                        </TouchableOpacity>
                                        <TouchableOpacity style={[styles.detailsActionButton, styles.detailsActionButtonSecondary]}>
                                            <Ionicons name="share-outline" size={20} color="#8b5cf6" />
                                            <Text style={styles.detailsActionTextSecondary}>Compartilhar</Text>
                                        </TouchableOpacity>
                                    </View>

                                    <Text style={styles.detailsSectionTitle}>
                                        Memórias ({connectionMemories.length})
                                    </Text>

                                    {connectionMemories.length === 0 ? (
                                        <View style={styles.detailsEmptyState}>
                                            <Ionicons name="journal-outline" size={48} color="#4b5563" />
                                            <Text style={styles.detailsEmptyText}>Nenhuma memória compartilhada ainda.</Text>
                                        </View>
                                    ) : (
                                        <View style={styles.detailsMemoriesList}>
                                            {connectionMemories.slice(0, 3).map((mem) => (
                                                <TouchableOpacity key={mem.id} style={styles.detailsMemoryCard}>
                                                    <Text style={styles.detailsMemoryEmoji}>{mem.emotionEmoji || '💭'}</Text>
                                                    <View style={styles.detailsMemoryInfo}>
                                                        <Text style={styles.detailsMemoryText} numberOfLines={2}>
                                                            {mem.transcription || 'Sem título'}
                                                        </Text>
                                                        <Text style={styles.detailsMemoryDate}>
                                                            {new Date(mem.createdAt).toLocaleDateString('pt-BR')}
                                                        </Text>
                                                    </View>
                                                </TouchableOpacity>
                                            ))}
                                            {connectionMemories.length > 3 && (
                                                <TouchableOpacity style={styles.detailsViewAllBtn}>
                                                    <Text style={styles.detailsViewAllText}>Ver todas</Text>
                                                </TouchableOpacity>
                                            )}
                                        </View>
                                    )}
                                </>
                            )}
                        </View>
                    </TouchableOpacity>
                </TouchableOpacity>
            </Modal>

            {/* Simple Add Modal */}
            <Modal
                visible={isAddModalVisible}
                animationType="slide"
                transparent={true}
            >
                <View style={styles.modalOverlay}>
                    <View style={styles.modalContent}>
                        <View style={styles.modalHeader}>
                            <Text style={styles.modalTitle}>Adicionar Conexão</Text>
                            <TouchableOpacity onPress={() => setIsAddModalVisible(false)}>
                                <Ionicons name="close" size={24} color="#9ca3af" />
                            </TouchableOpacity>
                        </View>

                        <Text style={styles.inputLabel}>Nome da pessoa</Text>
                        <TextInput
                            style={styles.input}
                            value={newName}
                            onChangeText={setNewName}
                            placeholder="Ex: Vó Maria"
                            placeholderTextColor="#6b7280"
                        />

                        <Text style={styles.inputLabel}>Qual a relação?</Text>
                        <TextInput
                            style={styles.input}
                            value={newRelation}
                            onChangeText={setNewRelation}
                            placeholder="Ex: Avó, Amigo de infância..."
                            placeholderTextColor="#6b7280"
                        />

                        <TouchableOpacity
                            style={[styles.saveBtn, !newName.trim() && styles.saveBtnDisabled]}
                            onPress={saveNewConnection}
                            disabled={!newName.trim()}
                        >
                            <Text style={styles.saveBtnText}>Adicionar</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#0a0a0f',
    },
    header: {
        paddingHorizontal: 20,
        paddingTop: 16,
        paddingBottom: 12,
        backgroundColor: '#0a0a0f',
        zIndex: 10,
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
    content: {
        flex: 1,
    },
    // Modal Styles
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.7)',
        justifyContent: 'flex-end',
    },
    modalContent: {
        backgroundColor: '#12121a',
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        padding: 24,
    },
    modalHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 24,
    },
    modalTitle: {
        fontSize: 20,
        color: '#fff',
        fontWeight: 'bold',
    },
    inputLabel: {
        color: '#9ca3af',
        fontSize: 14,
        marginBottom: 8,
    },
    input: {
        backgroundColor: '#1a1a24',
        borderWidth: 1,
        borderColor: '#2d2d3a',
        borderRadius: 12,
        padding: 16,
        color: '#fff',
        fontSize: 16,
        marginBottom: 20,
    },
    saveBtn: {
        backgroundColor: '#8b5cf6',
        borderRadius: 12,
        padding: 16,
        alignItems: 'center',
        marginTop: 10,
    },
    saveBtnDisabled: {
        backgroundColor: '#4b5563',
        opacity: 0.7,
    },
    saveBtnText: {
        color: '#fff',
        fontSize: 16,
        fontWeight: 'bold',
    },
    // Details BottomSheet Styles
    detailsContent: {
        paddingTop: 12,
        paddingBottom: 40,
    },
    modalDragIndicator: {
        width: 40,
        height: 4,
        backgroundColor: '#4b5563',
        borderRadius: 2,
        alignSelf: 'center',
        marginBottom: 20,
    },
    detailsHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 24,
    },
    detailsAvatar: {
        width: 60,
        height: 60,
        borderRadius: 30,
        backgroundColor: 'rgba(167, 139, 250, 0.1)',
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
        borderColor: 'rgba(167, 139, 250, 0.3)',
    },
    detailsTitleContainer: {
        flex: 1,
        marginLeft: 16,
    },
    detailsName: {
        fontSize: 22,
        fontWeight: 'bold',
        color: '#fff',
    },
    detailsRelationship: {
        fontSize: 14,
        color: '#9ca3af',
        marginTop: 4,
    },
    detailsCloseBtn: {
        padding: 4,
    },
    detailsActionRow: {
        flexDirection: 'row',
        gap: 12,
        marginBottom: 32,
    },
    detailsActionButton: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#8b5cf6',
        paddingVertical: 14,
        borderRadius: 12,
        gap: 8,
    },
    detailsActionButtonSecondary: {
        backgroundColor: 'rgba(139, 92, 246, 0.1)',
        borderWidth: 1,
        borderColor: 'rgba(139, 92, 246, 0.3)',
    },
    detailsActionText: {
        color: '#fff',
        fontWeight: '600',
        fontSize: 15,
    },
    detailsActionTextSecondary: {
        color: '#8b5cf6',
        fontWeight: '600',
        fontSize: 15,
    },
    detailsSectionTitle: {
        fontSize: 18,
        fontWeight: 'bold',
        color: '#fff',
        marginBottom: 16,
    },
    detailsEmptyState: {
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 32,
        backgroundColor: '#1a1a24',
        borderRadius: 16,
        borderWidth: 1,
        borderColor: '#2d2d3a',
    },
    detailsEmptyText: {
        color: '#9ca3af',
        fontSize: 14,
        marginTop: 12,
    },
    detailsMemoriesList: {
        gap: 12,
    },
    detailsMemoryCard: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#1a1a24',
        padding: 16,
        borderRadius: 16,
        gap: 12,
        borderWidth: 1,
        borderColor: '#2d2d3a',
    },
    detailsMemoryEmoji: {
        fontSize: 24,
    },
    detailsMemoryInfo: {
        flex: 1,
    },
    detailsMemoryText: {
        color: '#fff',
        fontSize: 15,
        lineHeight: 20,
    },
    detailsMemoryDate: {
        color: '#6b7280',
        fontSize: 12,
        marginTop: 4,
    },
    detailsViewAllBtn: {
        paddingVertical: 12,
        alignItems: 'center',
    },
    detailsViewAllText: {
        color: '#a78bfa',
        fontSize: 14,
        fontWeight: '600',
    },
});
