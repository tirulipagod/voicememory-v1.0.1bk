import React, { createContext, useContext, useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Personas de Escuta
export const LISTENING_PERSONAS = [
  {
    id: "therapeutic",
    name: "Terapêutico",
    subtitle: "Focado em Acolhimento",
    icon: "heart",
    color: "#ec4899",
    emoji: "💗",
    description: "Validação emocional. Focado em como você se sente e dar nome às emoções."
  },
  {
    id: "coach",
    name: "Coach de Ação",
    subtitle: "Focado em Solução",
    icon: "flash",
    color: "#f59e0b",
    emoji: "⚡",
    description: "Para quem está 'travado'. Foca em ações práticas e pequenos passos."
  },
  {
    id: "philosophical",
    name: "Filosófico",
    subtitle: "Focado em Significado",
    icon: "infinite",
    color: "#8b5cf6",
    emoji: "🔮",
    description: "Perspectiva de longo prazo, conectando o presente com valores fundamentais."
  },
  {
    id: "mentor",
    name: "Mentor",
    subtitle: "Focado em Crescimento",
    icon: "trending-up",
    color: "#10b981",
    emoji: "🎯",
    description: "Analisa buscando padrões de produtividade, liderança e objetivos de carreira."
  },
  {
    id: "documentarian",
    name: "Documentarista",
    subtitle: "Focado em Legado",
    icon: "book",
    color: "#3b82f6",
    emoji: "📚",
    description: "Não analisa, apenas organiza fatos. Ideal para biografias e memórias."
  }
];

export type PersonaId = typeof LISTENING_PERSONAS[number]['id'];

interface PersonaContextType {
  selectedPersona: PersonaId;
  setSelectedPersona: (id: PersonaId) => void;
  currentPersona: typeof LISTENING_PERSONAS[number] | undefined;
}

const PersonaContext = createContext<PersonaContextType | undefined>(undefined);

const PERSONA_STORAGE_KEY = '@diario_voz_persona';

export const PersonaProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [selectedPersona, setSelectedPersonaState] = useState<PersonaId>('therapeutic');

  // Carregar persona salva no início
  useEffect(() => {
    const loadPersona = async () => {
      try {
        const saved = await AsyncStorage.getItem(PERSONA_STORAGE_KEY);
        if (saved && LISTENING_PERSONAS.find(p => p.id === saved)) {
          setSelectedPersonaState(saved as PersonaId);
        }
      } catch (error) {
        console.error('Error loading persona:', error);
      }
    };
    loadPersona();
  }, []);

  const setSelectedPersona = async (id: PersonaId) => {
    setSelectedPersonaState(id);
    try {
      await AsyncStorage.setItem(PERSONA_STORAGE_KEY, id);
    } catch (error) {
      console.error('Error saving persona:', error);
    }
  };

  const currentPersona = LISTENING_PERSONAS.find(p => p.id === selectedPersona);

  return (
    <PersonaContext.Provider value={{ selectedPersona, setSelectedPersona, currentPersona }}>
      {children}
    </PersonaContext.Provider>
  );
};

export const usePersona = () => {
  const context = useContext(PersonaContext);
  if (context === undefined) {
    throw new Error('usePersona must be used within a PersonaProvider');
  }
  return context;
};
