import { Ionicons } from '@expo/vector-icons';
import { Stack, router } from 'expo-router';
import { TouchableOpacity, Platform } from 'react-native';
import MemoriesScreen from './index';

export default function MemoriesHistoryLayout() {
    return (
        <Stack
            screenOptions={{
                headerShown: true,
                headerStyle: { backgroundColor: '#12121a' },
                headerTintColor: '#fff',
                headerTitleStyle: { fontWeight: 'bold' },
                headerLeft: () => (
                    <TouchableOpacity onPress={() => router.back()} style={{ marginLeft: Platform.OS === 'ios' ? 0 : 10, padding: 5 }}>
                        <Ionicons name="arrow-back" size={24} color="#fff" />
                    </TouchableOpacity>
                ),
            }}
        >
            <Stack.Screen
                name="index"
                options={{
                    title: 'Histórico de Memórias',
                }}
            />
        </Stack>
    );
}
