export const REFLECTION_PROMPTS = [
    // Presente e dia a dia
    { text: "O que te fez sorrir hoje?", emoji: "😊", category: "presente" },
    { text: "Como você está se sentindo agora?", emoji: "💭", category: "presente" },
    { text: "Qual foi o momento mais marcante do dia?", emoji: "✨", category: "presente" },
    { text: "O que você é grato hoje?", emoji: "🙏", category: "presente" },
    { text: "O que você aprendeu recentemente?", emoji: "💡", category: "presente" },
    { text: "Quem fez diferença no seu dia?", emoji: "❤️", category: "presente" },
    { text: "O que te deixou ansioso?", emoji: "🌊", category: "presente" },
    { text: "Como foi sua energia hoje?", emoji: "⚡", category: "presente" },
    { text: "O que te trouxe paz hoje?", emoji: "🕊️", category: "presente" },
    { text: "Qual conversa te marcou?", emoji: "💬", category: "presente" },
    // Memórias do passado
    { text: "Qual lembrança te faz sorrir?", emoji: "🌈", category: "passado" },
    { text: "Que momento da infância você guarda?", emoji: "🧒", category: "passado" },
    { text: "Qual viagem marcou sua vida?", emoji: "✈️", category: "passado" },
    { text: "Quem você gostaria de agradecer?", emoji: "💝", category: "passado" },
    { text: "Que música te leva ao passado?", emoji: "🎵", category: "passado" },
    { text: "Qual foi seu momento mais corajoso?", emoji: "🦁", category: "passado" },
    { text: "Que lugar te traz saudade?", emoji: "🏠", category: "passado" },
    { text: "Qual foi a melhor surpresa que recebeu?", emoji: "🎁", category: "passado" },
    { text: "Que cheiro te lembra alguém especial?", emoji: "🌸", category: "passado" },
    { text: "Qual foi um dia perfeito na sua vida?", emoji: "☀️", category: "passado" },
    // Reflexão profunda
    { text: "O que você superou que te orgulha?", emoji: "💪", category: "reflexao" },
    { text: "Que sonho você ainda quer realizar?", emoji: "🌙", category: "reflexao" },
    { text: "O que você diria ao seu eu do passado?", emoji: "💌", category: "reflexao" },
    { text: "Qual momento mudou sua perspectiva?", emoji: "🔮", category: "reflexao" },
    { text: "O que te fez crescer como pessoa?", emoji: "🌱", category: "reflexao" },
    { text: "Que erro te ensinou uma lição valiosa?", emoji: "📚", category: "reflexao" },
    { text: "Qual foi sua maior conquista?", emoji: "🏆", category: "reflexao" },
    { text: "O que você deseja para o futuro?", emoji: "🌅", category: "reflexao" },
    { text: "Que memória você nunca quer esquecer?", emoji: "📸", category: "reflexao" },
    { text: "O que te faz sentir vivo?", emoji: "🔥", category: "reflexao" },
];

export const GOAL_PROMPTS: Record<string, typeof REFLECTION_PROMPTS> = {
    self_awareness: [
        { text: "Qual emoção tem te visitado mais ultimamente?", emoji: "🧭", category: "autoconhecimento" },
        { text: "O que você aprendeu sobre si mesmo hoje?", emoji: "🪞", category: "autoconhecimento" },
        { text: "O que te fez sorrir hoje?", emoji: "✨", category: "autoconhecimento" }
    ],
    venting: [
        { text: "Coloque para fora o que está pesando no seu peito hoje.", emoji: "🗣️", category: "desabafo" },
        { text: "Não há julgamentos aqui. Qual frustração você quer liberar?", emoji: "🛡️", category: "desabafo" },
        { text: "O que você falaria pra si mesmo se pudesse se ouvir de fora?", emoji: "⚖️", category: "desabafo" }
    ],
    legacy: [
        { text: "Que história da sua juventude você não quer que se perca?", emoji: "📜", category: "legado" },
        { text: "Se alguém ouvisse isso daqui a 10 anos, o que eles deveriam saber?", emoji: "🕰️", category: "legado" },
        { text: "Qual legado você quer deixar para quem ama?", emoji: "💎", category: "legado" }
    ],
    anxiety: [
        { text: "Vamos esvaziar a mente? Liste 3 coisas que estão te preocupando e solte-as.", emoji: "🍃", category: "ansiedade" },
        { text: "Fale devagar sobre algo simples e bom que aconteceu hoje.", emoji: "🌅", category: "ansiedade" },
        { text: "O que te traz paz quando tudo parece agitado?", emoji: "🕯️", category: "ansiedade" }
    ]
};
