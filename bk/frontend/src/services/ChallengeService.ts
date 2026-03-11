import { REFLECTION_PROMPTS, GOAL_PROMPTS } from '../config/Prompts';

export interface Challenge {
    text: string;
    emoji: string;
    category: string;
}

export const getDailyChallenges = (userGoal?: string): Challenge[] => {
    const todayStr = new Date().toDateString();
    let seed = 0;
    for (let i = 0; i < todayStr.length; i++) seed += todayStr.charCodeAt(i);

    // Seeded random
    const random = () => {
        const x = Math.sin(seed++) * 10000;
        return x - Math.floor(x);
    };

    const goalPrompts = userGoal && GOAL_PROMPTS[userGoal] ? [...GOAL_PROMPTS[userGoal]] : [];
    const generalPrompts = [...REFLECTION_PROMPTS].sort(() => random() - 0.5);
    const combined = [...goalPrompts, ...generalPrompts].slice(0, 3);

    return combined.map(p => ({
        ...p,
        text: p.text.replace(/^Desafio Diário:?\s*/i, '') // Removes "Desafio Diário:" prefix if exists
    }));
};
