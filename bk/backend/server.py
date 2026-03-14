from fastapi import FastAPI, APIRouter, HTTPException, Depends, Query
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field, EmailStr
from typing import List, Optional, Dict, Any
import uuid
from datetime import datetime, timedelta
import jwt
import bcrypt
import base64
import asyncio
from google import genai
from google.genai import types
import re
import random
from collections import defaultdict
import json

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env', override=True)

mongo_url = os.environ.get('MONGO_URL', '')
if mongo_url and '<SUA_CONTA_AQUI>' not in mongo_url:
    client = AsyncIOMotorClient(mongo_url)
    db = client[os.environ.get('DB_NAME', 'voicememory')]
else:
    # Offline dummy DB mode, only Gemini will work.
    client = None
    
    class DummyDB:
        def __getattr__(self, name):
            # Return a generic object that has empty async methods so the server doesn't crash on boot or weird route polls.
            class DummyCollection:
                async def insert_one(self, *args, **kwargs): return None
                async def find_one(self, *args, **kwargs): return None
                async def update_one(self, *args, **kwargs): return None
                async def delete_one(self, *args, **kwargs): 
                    class DummyResult: deleted_count = 0
                    return DummyResult()
                def find(self, *args, **kwargs):
                    class DummyCursor:
                        def sort(self, *args, **kwargs): return self
                        def skip(self, *args, **kwargs): return self
                        def limit(self, *args, **kwargs): return self
                        async def to_list(self, *args, **kwargs): return []
                    return DummyCursor()
                async def aggregate(self, *args, **kwargs):
                    return []
                async def count_documents(self, *args, **kwargs): return 0
                async def replace_one(self, *args, **kwargs): return None
            return DummyCollection()
    
    db = DummyDB()

JWT_SECRET = os.environ.get('JWT_SECRET', 'fallback_secret_key')
JWT_ALGORITHM = "HS256"
JWT_EXPIRATION_HOURS = 168

# Google Cloud credentials
GEMINI_API_KEY = os.environ.get('GEMINI_API_KEY', '')
GOOGLE_APPLICATION_CREDENTIALS = os.environ.get('GOOGLE_APPLICATION_CREDENTIALS', '')

# Set credentials path for Google Cloud SDK
if GOOGLE_APPLICATION_CREDENTIALS:
    os.environ['GOOGLE_APPLICATION_CREDENTIALS'] = GOOGLE_APPLICATION_CREDENTIALS

# Initialize Gemini client for AI analysis
gemini_client = None
if GEMINI_API_KEY:
    gemini_client = genai.Client(api_key=GEMINI_API_KEY)

# Speech client removed - using Gemini for transcription

app = FastAPI(title="Diário de Voz API")
api_router = APIRouter(prefix="/api")
security = HTTPBearer()

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# ==================== MODELS ====================

class UserCreate(BaseModel):
    email: EmailStr
    password: str
    name: str

class UserLogin(BaseModel):
    email: EmailStr
    password: str

class UserResponse(BaseModel):
    id: str
    email: str
    name: str
    created_at: datetime

class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserResponse

class TimestampedSegment(BaseModel):
    text: str
    start_time: float
    end_time: float

class MemoryCreate(BaseModel):
    audio_base64: Optional[str] = None
    duration_seconds: Optional[float] = None
    transcription: Optional[str] = None

class MemoryUpdate(BaseModel):
    memory_date: Optional[str] = None
    deleted: Optional[bool] = None

class EmotionDetail(BaseModel):
    emotion: str
    emoji: str
    intensity: int

class MemoryResponse(BaseModel):
    id: str
    user_id: str
    transcription: str
    emotion: str
    emotion_emoji: str
    mood_score: int
    audio_base64: Optional[str] = None
    duration_seconds: Optional[float] = None
    detected_date: Optional[str] = None
    memory_date: Optional[str] = None
    segments: Optional[List[TimestampedSegment]] = None
    emotions: Optional[List[EmotionDetail]] = None
    summary: Optional[str] = None
    deleted: bool = False
    created_at: datetime
    updated_at: Optional[datetime] = None

class MemoryListResponse(BaseModel):
    memories: List[MemoryResponse]
    total: int

class EmotionStats(BaseModel):
    emotion: str
    count: int
    percentage: float

class StatsResponse(BaseModel):
    total_memories: int
    total_duration_minutes: float
    emotion_distribution: List[EmotionStats]
    mood_average: float
    streak_days: int

class TranscribeRequest(BaseModel):
    audio_base64: str
    duration_seconds: Optional[float] = None

class TranscribeResponse(BaseModel):
    transcription: str
    segments: Optional[List[TimestampedSegment]] = None

# New models for exploration
class MonthData(BaseModel):
    month: str  # "2025-01"
    month_label: str  # "Janeiro 2025"
    count: int
    avg_mood: float
    dominant_emotion: str
    dominant_emoji: str

class TimelineResponse(BaseModel):
    months: List[MonthData]
    total_months: int

class EmotionCluster(BaseModel):
    emotion: str
    emoji: str
    count: int
    memories: List[Dict[str, Any]]
    insight: Optional[str] = None

class EmotionMapResponse(BaseModel):
    clusters: List[EmotionCluster]
    total_emotions: int

class CuratedSection(BaseModel):
    id: str
    title: str
    subtitle: str
    icon: str
    color: str
    memories: List[Dict[str, Any]]
    empty_message: Optional[str] = None

class InsightsResponse(BaseModel):
    sections: List[CuratedSection]

class RevisitSuggestion(BaseModel):
    id: str
    type: str  # "year_ago", "happy_memory", "growth", "random"
    title: str
    subtitle: str
    memory: Optional[Dict[str, Any]] = None
    action_text: str
    icon: str

class RevisitResponse(BaseModel):
    suggestions: List[RevisitSuggestion]
    has_suggestions: bool

class MoodChartPoint(BaseModel):
    date: str
    mood: float
    emotion: str

class MoodChartResponse(BaseModel):
    points: List[MoodChartPoint]
    average: float
    trend: str  # "up", "down", "stable"

# ==================== CHAT RAG MODELS ====================
class MemoryContext(BaseModel):
    id: str
    transcription: str
    emotion: str
    emotionEmoji: str
    moodScore: int
    createdAt: str
    memoryDate: Optional[str] = None
    summary: Optional[str] = None

class UserContext(BaseModel):
    name: Optional[str] = None
    birth_date: Optional[str] = None
    goal: Optional[str] = None

class ChatMessage(BaseModel):
    message: str
    persona: str = "therapeutic"
    memories: List[MemoryContext] = []  # Frontend sends memories for offline-first approach
    user_context: Optional[UserContext] = None

class ChatResponse(BaseModel):
    response: str
    persona_used: str
    memories_analyzed: int

class ChallengeValidationRequest(BaseModel):
    audio_base64: str
    challenge_text: str

class ChallengeValidationResponse(BaseModel):
    success: bool
    message: str
    feedback: str
    transcription: str
    reward_xp: int = 50
    memory_data: Optional[Dict[str, Any]] = None

# ==================== HELPERS ====================

def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')

def verify_password(password: str, hashed: str) -> bool:
    return bcrypt.checkpw(password.encode('utf-8'), hashed.encode('utf-8'))

def create_token(user_id: str) -> str:
    payload = {"user_id": user_id, "exp": datetime.utcnow() + timedelta(hours=JWT_EXPIRATION_HOURS)}
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)

def decode_token(token: str) -> dict:
    try:
        return jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expirado")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Token inválido")

async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    token = credentials.credentials
    payload = decode_token(token)
    user = await db.users.find_one({"id": payload["user_id"]})
    if not user:
        raise HTTPException(status_code=401, detail="Usuário não encontrado")
    return user

EMOTION_MAP = {
    "feliz": "😊", "triste": "😢", "ansioso": "😰", "calmo": "😌",
    "animado": "🤩", "frustrado": "😤", "grato": "🙏", "nostálgico": "🥺",
    "esperançoso": "✨", "cansado": "😴", "neutro": "😐", "apaixonado": "😍",
    "irritado": "😠", "surpreso": "😲", "confuso": "😕", "orgulhoso": "💪",
    "aliviado": "😮‍💨", "entediado": "😒", "preocupado": "😟"
}

EMOTION_CATEGORIES = {
    "positive": ["feliz", "animado", "grato", "esperançoso", "apaixonado", "orgulhoso", "aliviado", "calmo"],
    "negative": ["triste", "ansioso", "frustrado", "irritado", "preocupado"],
    "neutral": ["neutro", "cansado", "entediado", "confuso", "surpreso", "nostálgico"]
}

# ==================== PERSONAS DE ESCUTA ====================
LISTENING_PERSONAS = {
    "mentor": {
        "id": "mentor",
        "name": "Mentor",
        "subtitle": "Focado em Crescimento",
        "icon": "trending-up",
        "color": "#10b981",
        "emoji": "🎯",
        "description": "Analisa suas falas buscando padrões de produtividade, liderança e objetivos de carreira.",
        "prompt_focus": "Analise esta fala focando em: crescimento pessoal, metas de carreira, produtividade, liderança, ambições profissionais e padrões de sucesso. Identifique oportunidades de desenvolvimento."
    },
    "therapeutic": {
        "id": "therapeutic",
        "name": "Terapêutico",
        "subtitle": "Focado em Acolhimento",
        "icon": "heart",
        "color": "#ec4899",
        "emoji": "💗",
        "description": "Validação emocional pura. Focado em como você se sente e em dar nome às emoções.",
        "prompt_focus": "Analise esta fala com foco em validação emocional. Identifique e nomeie as emoções subjacentes (ex: a raiva pode ser cansaço disfarçado). Seja acolhedor e empático. Foque em 'como a pessoa se sente' profundamente."
    },
    "philosophical": {
        "id": "philosophical",
        "name": "Filosófico",
        "subtitle": "Focado em Significado",
        "icon": "infinite",
        "color": "#8b5cf6",
        "emoji": "🔮",
        "description": "Perspectiva de longo prazo, conectando o presente com valores fundamentais.",
        "prompt_focus": "Analise esta fala buscando significado profundo. Conecte o que é dito com valores fundamentais, propósito de vida e o 'porquê' das coisas. Traga perspectiva de longo prazo e reflexões existenciais."
    },
    "coach": {
        "id": "coach",
        "name": "Coach de Ação",
        "subtitle": "Focado em Solução",
        "icon": "flash",
        "color": "#f59e0b",
        "emoji": "⚡",
        "description": "Para quem está 'travado'. Foca em ações práticas e pequenos passos.",
        "prompt_focus": "Analise esta fala com foco em ação e solução. Se há reclamações ou problemas, sugira: 'Qual o menor passo que pode ser dado hoje?'. Seja prático, direto e orientado a resultados imediatos."
    },
    "documentarian": {
        "id": "documentarian",
        "name": "Documentarista",
        "subtitle": "Focado em Legado",
        "icon": "book",
        "color": "#3b82f6",
        "emoji": "📚",
        "description": "Não analisa, apenas organiza fatos. Ideal para biografias e memórias.",
        "prompt_focus": "Organize esta fala como um documentário de vida. Não analise ou julgue - apenas capture os fatos, pessoas, lugares e momentos importantes. Estruture como se fosse para uma biografia ou memórias para os filhos."
    },
    "analytical": {
        "id": "analytical",
        "name": "Analítico",
        "subtitle": "Focado em Dados",
        "icon": "stats-chart",
        "color": "#0ea5e9",
        "emoji": "📊",
        "description": "Baseia suas respostas em dados de humor e frequência de emoções detectadas.",
        "prompt_focus": "Analise esta fala cruzando com os dados estatísticos das memórias (moodScore, frequências de emoções). Identifique tendências emocionais ao longo do tempo e ofereça um feedback baseado em evidências."
    }
}

# ==================== ÁREAS DA VIDA (TAGS INTELIGENTES) ====================
LIFE_AREAS = {
    "work": {
        "id": "work",
        "name": "Trabalho & Carreira",
        "icon": "briefcase",
        "color": "#3b82f6",
        "emoji": "💼",
        "keywords": ["trabalho", "emprego", "escritório", "chefe", "reunião", "projeto", "deadline", "carreira", 
                    "promoção", "salário", "empresa", "cliente", "colega", "profissional", "meta", "relatório",
                    "apresentação", "negócio", "startup", "empreender", "home office", "produtividade"]
    },
    "relationships": {
        "id": "relationships",
        "name": "Relacionamentos",
        "icon": "heart",
        "color": "#ec4899",
        "emoji": "❤️",
        "keywords": ["amor", "namorado", "namorada", "esposo", "esposa", "marido", "mulher", "filho", "filha",
                    "família", "mãe", "pai", "irmão", "irmã", "avó", "avô", "parente", "casamento", "namoro",
                    "relacionamento", "casal", "bebê", "criança", "cônjuge", "parceiro", "parceira"]
    },
    "health": {
        "id": "health",
        "name": "Saúde & Energia",
        "icon": "fitness",
        "color": "#10b981",
        "emoji": "🏃",
        "keywords": ["saúde", "academia", "exercício", "treino", "corrida", "médico", "hospital", "doença",
                    "energia", "cansaço", "sono", "dormir", "alimentação", "dieta", "peso", "corpo",
                    "yoga", "meditação", "bem-estar", "vitamina", "remédio", "terapia", "psicólogo"]
    },
    "finances": {
        "id": "finances",
        "name": "Finanças & Segurança",
        "icon": "cash",
        "color": "#eab308",
        "emoji": "💰",
        "keywords": ["dinheiro", "conta", "banco", "investimento", "economia", "poupança", "gasto", "compra",
                    "salário", "renda", "dívida", "empréstimo", "financiamento", "cartão", "boleto",
                    "casa própria", "aluguel", "aposentadoria", "seguro", "patrimônio", "orçamento"]
    },
    "social": {
        "id": "social",
        "name": "Social & Amizades",
        "icon": "people",
        "color": "#f97316",
        "emoji": "👥",
        "keywords": ["amigo", "amiga", "amizade", "festa", "encontro", "sair", "balada", "bar", "restaurante",
                    "viagem", "grupo", "turma", "galera", "conversa", "papo", "risada", "diversão",
                    "churrasco", "aniversário", "comemoração", "happy hour", "rede social", "instagram"]
    },
    "leisure": {
        "id": "leisure",
        "name": "Lazer & Espiritualidade",
        "icon": "sparkles",
        "color": "#a855f7",
        "emoji": "✨",
        "keywords": ["descanso", "relaxar", "hobby", "filme", "série", "música", "livro", "leitura", "arte",
                    "natureza", "praia", "montanha", "viagem", "férias", "feriado", "fim de semana",
                    "igreja", "oração", "fé", "deus", "espiritual", "meditação", "gratidão", "paz",
                    "yoga", "retiro", "silêncio", "contemplação", "propósito", "alma"]
    }
}

def detect_life_areas(text: str) -> List[Dict[str, Any]]:
    """Detecta automaticamente as áreas da vida mencionadas no texto"""
    text_lower = text.lower()
    detected_areas = []
    
    for area_id, area_data in LIFE_AREAS.items():
        matches = sum(1 for keyword in area_data["keywords"] if keyword in text_lower)
        if matches > 0:
            # Calcula intensidade baseado no número de matches
            intensity = min(100, matches * 20)
            detected_areas.append({
                "id": area_id,
                "name": area_data["name"],
                "icon": area_data["icon"],
                "color": area_data["color"],
                "emoji": area_data["emoji"],
                "intensity": intensity,
                "matches": matches
            })
    
    # Ordena por intensidade
    detected_areas.sort(key=lambda x: x["intensity"], reverse=True)
    return detected_areas

MONTH_NAMES = {
    1: "Janeiro", 2: "Fevereiro", 3: "Março", 4: "Abril",
    5: "Maio", 6: "Junho", 7: "Julho", 8: "Agosto",
    9: "Setembro", 10: "Outubro", 11: "Novembro", 12: "Dezembro"
}

def create_segments_from_transcription(transcription: str, duration_seconds: float) -> List[dict]:
    if not transcription or not duration_seconds or duration_seconds <= 0:
        return []
    sentences = re.split(r'(?<=[.!?])\s+', transcription.strip())
    sentences = [s.strip() for s in sentences if s.strip()]
    if duration_seconds is None:
        duration_seconds = 0.0
    if not sentences:
        return [{"text": transcription, "start_time": 0.0, "end_time": duration_seconds}]
    total_chars = sum(len(s) for s in sentences)
    if total_chars == 0:
        return [{"text": transcription, "start_time": 0.0, "end_time": duration_seconds}]
    segments = []
    current_time = 0
    for sentence in sentences:
        sentence_duration = (len(sentence) / total_chars) * duration_seconds
        segments.append({"text": sentence, "start_time": round(float(current_time), 2), "end_time": round(float(current_time + sentence_duration), 2)})
        current_time += sentence_duration
    return segments

async def transcribe_audio_gemini(audio_base64: str, duration_seconds: Optional[float] = None) -> tuple:
    """Transcription using Gemini"""
    try:
        if not gemini_client:
            return "", []
        audio_bytes = base64.b64decode(audio_base64)
        response = gemini_client.models.generate_content(
            model="gemini-2.0-flash",
            contents=["Transcreva este áudio para texto em português brasileiro. Retorne APENAS o texto transcrito, sem explicações.", types.Part.from_bytes(data=audio_bytes, mime_type="audio/mp4")]
        )
        transcription = response.text.strip()
        segments = create_segments_from_transcription(transcription, duration_seconds or 0)
        return transcription, segments
    except Exception as e:
        logger.error(f"Gemini transcription error: {e}")
        return "", []

async def analyze_emotion(text: str, persona: str = "therapeutic", connections: List[dict] = None) -> dict:
    """Analyze emotion using Gemini API - supports multiple emotions, summary, life areas, and Phase 3 NER"""
    try:
        # Detect life areas from text
        life_areas = detect_life_areas(text)
        
        if not gemini_client:
            logger.warning("Gemini client not available for emotion analysis")
            return {
                "emotion": "neutro", 
                "emotion_emoji": "😐",
                "mood_score": 5, 
                "detected_date": None,
                "emotions": [{"emotion": "neutro", "emoji": "😐", "intensity": 50}],
                "summary": "",
                "life_areas": life_areas,
                "is_sensitive": False
            }
        
        # Get persona-specific prompt focus
        persona_data = LISTENING_PERSONAS.get(persona, LISTENING_PERSONAS["therapeutic"])
        persona_focus = persona_data.get("prompt_focus", "")
        
        today = datetime.now().strftime("%Y-%m-%d")
        prompt = f"""Você é um analisador de emoções especializado. Data de hoje: {today}. 

PERSONA DE ESCUTA: {persona_data['name']} - {persona_focus}

Analise o texto abaixo e identifique TODAS as emoções presentes (uma memória pode ter várias emoções).

Retorne APENAS um JSON válido com:
- emotion: a emoção principal/dominante (feliz, triste, ansioso, calmo, animado, frustrado, grato, nostálgico, esperançoso, cansado, neutro, apaixonado, irritado, surpreso, confuso, orgulhoso, aliviado, entediado, preocupado, saudoso, reflexivo, empolgado, melancolico)
- emotion_emoji: emoji correspondente à emoção principal
- mood_score: número de 1 a 10 representando o humor geral
- detected_date: se o texto menciona uma data específica de quando aconteceu, retorne no formato YYYY-MM-DD, caso contrário null
- emotions: array com TODAS as emoções identificadas, cada uma com:
  - emotion: nome da emoção
  - emoji: emoji correspondente  
  - intensity: intensidade de 1-100
- summary: um breve resumo de 1-2 frases sobre o conteúdo emocional da memória, escrito de acordo com a persona de escuta ({persona_data['name']})
- persona_insight: uma reflexão ou pergunta específica baseada na persona de escuta escolhida
- detected_names: array JSON de nomes próprios e apelidos de pessoas mencionados no texto (ex: ["Emily", "Carlos"]). Se houver uma lista de CONEXÕES EXISTENTES abaixo, priorize identificar esses nomes se mencionados.
- is_sensitive: booleano (true ou false) - marque como true ESTRITAMENTE SE o conteúdo for criminoso ou indicar perigo iminente (risco de vida claro, intenção real de suicídio, violência física, abuso doméstico). NÃO marque como true para tristeza, luto, dores emocionais do dia a dia ou meros desabafos sem intenção de se machucar. Se for true, ignore a persona e o 'summary' DEVE se tornar um alerta ACOLHEDOR PORÉM FIRME (seja empático para acalmar a pessoa, mas diga claramente que a ação cogitada é errada/perigosa/insana para prevenir danos, e instrua amigavelmente a buscar ajuda médica ou policial urgente).

CONEXÕES EXISTENTES NA CONSTELAÇÃO DO USUÁRIO (Use para ajudar a identificar nomes):
{json.dumps(connections) if connections else "Nenhuma conexão criada ainda."}

REGRAS RÍGIDAS EXTRAS DA IA (SEGURANÇA E NEUTRALIDADE):
1. NEUTRALIDADE RELIGIOSA: A IA DEVE ser estritamente laica. JAMAIS mencione Deus, orações, bênçãos, carma ou presuma crenças espirituais do usuário. Fale apenas de resiliência psicológica e força interior.
2. NUNCA tire conclusões precipitadas. Se o usuário diz que "pensou" ou "queria" fazer algo no passado, não diga que ele FEZ nem dispare alerta de segurança se não houver risco atual.
3. Seja preciso com a linha do tempo do usuário, respeitando os tempos verbais exatos.

Texto para análise: {text}

Retorne SOMENTE o JSON, sem markdown ou explicações."""

        response = gemini_client.models.generate_content(
            model="gemini-2.0-flash",
            contents=[prompt]
        )
        
        response_text = response.text.strip()
        print(f"--- GEMINI RESPONSE ---\n{response_text}\n----------------------")
        # Clean up response if wrapped in markdown
        if response_text.startswith("```"):
            response_text = response_text.split("```")[1]
            if response_text.startswith("json"):
                response_text = response_text[4:]
        if response_text.endswith("```"):
            response_text = response_text[:-3]
        
        result = json.loads(response_text.strip())
        
        # Ensure all fields exist
        emotion = result.get("emotion", "neutro")
        emotions_list = result.get("emotions", [{"emotion": emotion, "emoji": result.get("emotion_emoji", "😐"), "intensity": 70}])
        
        summary = result.get("summary", "")
        if result.get("is_sensitive", False):
            summary = f"[ALERTA_SENSIVEL] {summary}"

        logger.info(f"Emotion analysis with Gemini: {emotion}, emotions: {len(emotions_list)}, score: {result.get('mood_score')}, areas: {len(life_areas)}")
        return {
            "emotion": emotion, 
            "emotion_emoji": result.get("emotion_emoji", "😐"),
            "mood_score": result.get("mood_score", 5), 
            "detected_date": result.get("detected_date"),
            "emotions": emotions_list,
            "summary": summary,
            "persona_insight": result.get("persona_insight", ""),
            "life_areas": life_areas,
            "detected_names": result.get("detected_names", [])
        }
    except Exception as e:
        logger.error(f"Emotion analysis error with Gemini: {e}")
        life_areas = detect_life_areas(text) if text else []
        return {
            "emotion": "neutro", 
            "emotion_emoji": "😐",
            "mood_score": 5, 
            "detected_date": None,
            "emotions": [{"emotion": "neutro", "emoji": "😐", "intensity": 50}],
            "summary": "",
            "persona_insight": "",
            "life_areas": life_areas
        }

def memory_to_dict(m: dict) -> dict:
    return {
        "id": m["id"],
        "transcription": m.get("transcription", "")[:150] + ("..." if len(m.get("transcription", "")) > 150 else ""),
        "emotion": m.get("emotion", "neutro"),
        "emotion_emoji": m.get("emotion_emoji", "😐"),
        "mood_score": m.get("mood_score", 5),
        "created_at": m["created_at"].isoformat() if isinstance(m["created_at"], datetime) else m["created_at"],
        "has_audio": bool(m.get("audio_base64"))
    }

# ==================== AUTH ROUTES ====================

@api_router.post("/auth/register", response_model=TokenResponse)
async def register(user_data: UserCreate):
    existing = await db.users.find_one({"email": user_data.email})
    if existing:
        raise HTTPException(status_code=400, detail="Email já cadastrado")
    user_id = str(uuid.uuid4())
    user = {"id": user_id, "email": user_data.email, "name": user_data.name, "password_hash": hash_password(user_data.password), "created_at": datetime.utcnow()}
    await db.users.insert_one(user)
    token = create_token(user_id)
    return TokenResponse(access_token=token, user=UserResponse(id=user_id, email=user_data.email, name=user_data.name, created_at=user["created_at"]))

@api_router.post("/auth/login", response_model=TokenResponse)
async def login(credentials: UserLogin):
    user = await db.users.find_one({"email": credentials.email})
    if not user or not verify_password(credentials.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Email ou senha incorretos")
    token = create_token(user["id"])
    return TokenResponse(access_token=token, user=UserResponse(id=user["id"], email=user["email"], name=user["name"], created_at=user["created_at"]))

@api_router.get("/auth/me", response_model=UserResponse)
async def get_me(current_user: dict = Depends(get_current_user)):
    return UserResponse(id=current_user["id"], email=current_user["email"], name=current_user["name"], created_at=current_user["created_at"])

# ==================== MEMORY ROUTES ====================

@api_router.post("/memories/transcribe", response_model=TranscribeResponse)
async def transcribe_audio_endpoint(request: TranscribeRequest, current_user: dict = Depends(get_current_user)):
    transcription, segments = await transcribe_audio_gemini(request.audio_base64, request.duration_seconds)
    return TranscribeResponse(transcription=transcription or "", segments=segments)

# Public transcription endpoint (no auth required for local-first approach)
@api_router.post("/transcribe", response_model=TranscribeResponse)
async def transcribe_audio_public(request: TranscribeRequest):
    """Public transcription endpoint for local-first recordings"""
    transcription, segments = await transcribe_audio_gemini(request.audio_base64, request.duration_seconds)
    return TranscribeResponse(transcription=transcription or "", segments=segments)

# Public emotion analysis endpoint
class ConnectionInfo(BaseModel):
    id: str
    name: str
    relationship: str

class EmotionAnalysisRequest(BaseModel):
    text: str
    persona: Optional[str] = "therapeutic"
    connections: Optional[List[ConnectionInfo]] = []   # Phase 3: for cross-ref NER

class LifeAreaResponse(BaseModel):
    id: str
    name: str
    icon: str
    color: str
    emoji: str
    intensity: int
    matches: int

class EmotionAnalysisResponse(BaseModel):
    emotion: str
    emotion_emoji: str
    mood_score: int
    emotions: List[dict]
    summary: str
    persona_insight: Optional[str] = ""
    life_areas: Optional[List[LifeAreaResponse]] = []
    mentioned_connections: Optional[List[str]] = []   # IDs matched against constellation
    detected_names: Optional[List[str]] = []          # Raw NER output for UI prompts

@api_router.post("/analyze-emotion", response_model=EmotionAnalysisResponse)
async def analyze_emotion_public(request: EmotionAnalysisRequest):
    """Public emotion analysis endpoint for local-first approach (Phase 3 Unified)"""
    # Use unified internal call
    emotion_data = await analyze_emotion(
        request.text, 
        request.persona or "therapeutic",
        connections=[c.dict() for c in request.connections] if request.connections else []
    )

    detected_names = emotion_data.get("detected_names", [])
    
    # ── Phase 3.2: Cross-reference NER names against constellation connections ──
    mentioned_connection_ids: List[str] = []
    if request.connections:
        lower_detected = [n.lower() for n in detected_names]
        text_lower = request.text.lower()
        
        for conn in request.connections:
            conn_name_lower = conn.name.lower()
            # Triple check: 
            # 1. Name is in AI detected list
            # 2. Connection name is explicitly in raw text
            # 3. Connection name is a substring of any detected name (e.g. "Mary" in "Mary Jane")
            is_matched = (
                conn_name_lower in lower_detected or 
                conn_name_lower in text_lower or
                any(conn_name_lower in d for d in lower_detected)
            )
            
            if is_matched:
                mentioned_connection_ids.append(conn.id)

    return EmotionAnalysisResponse(
        emotion=emotion_data.get("emotion", "neutro"),
        emotion_emoji=emotion_data.get("emotion_emoji", "😐"),
        mood_score=emotion_data.get("mood_score", 5),
        emotions=emotion_data.get("emotions", []),
        summary=emotion_data.get("summary", ""),
        persona_insight=emotion_data.get("persona_insight", ""),
        life_areas=emotion_data.get("life_areas", []),
        mentioned_connections=mentioned_connection_ids,
        detected_names=detected_names,
    )

# ──────────────── PHASE 3.3: COPILOTO RELACIONAL ─────────────────────
class ConnectionSummaryRequest(BaseModel):
    connection_name: str
    connection_relationship: str
    memories: List[str]          # Last N transcriptions (latest first)

class ConnectionSummaryResponse(BaseModel):
    summary: str

@api_router.post("/connection-summary", response_model=ConnectionSummaryResponse)
async def generate_connection_summary(request: ConnectionSummaryRequest):
    """Generate a 2-line relational Copilot summary for a connection.
    Cost-optimised: only called from the frontend when new memories were added."""
    if not gemini_client:
        return ConnectionSummaryResponse(summary="")

    memories_text = "\n".join(f"- {m}" for m in request.memories[:10])  # cap at 10
    prompt = (
        f"Você é um copiloto relacional empático. "
        f"Com base nas últimas memórias envolvendo '{request.connection_name}' ({request.connection_relationship}), "
        f"escreva um insight conciso de exatamente 2 frases, em português, na segunda pessoa (dirigido ao utilizador). "
        f"Capture o padrão emocional da relação de forma acolhedora. Não invente factos. "
        f"Memórias:\n{memories_text}\n\n"
        f"Retorna APENAS as 2 frases, sem títulos, aspas ou markdown."
    )
    try:
        resp = gemini_client.models.generate_content(
            model="gemini-2.0-flash",
            contents=[prompt]
        )
        return ConnectionSummaryResponse(summary=resp.text.strip())
    except Exception as e:
        logger.warning(f"Connection summary failed: {e}")
        return ConnectionSummaryResponse(summary="")

# ==================== PERSONAS & LIFE AREAS ENDPOINTS ====================

@api_router.get("/personas")
async def get_listening_personas():
    """Get all available listening personas"""
    personas = []
    for persona_id, persona_data in LISTENING_PERSONAS.items():
        personas.append({
            "id": persona_data["id"],
            "name": persona_data["name"],
            "subtitle": persona_data["subtitle"],
            "icon": persona_data["icon"],
            "color": persona_data["color"],
            "emoji": persona_data["emoji"],
            "description": persona_data["description"]
        })
    return {"personas": personas}

@api_router.get("/life-areas")
async def get_life_areas():
    """Get all life areas for the heat map"""
    areas = []
    for area_id, area_data in LIFE_AREAS.items():
        areas.append({
            "id": area_data["id"],
            "name": area_data["name"],
            "icon": area_data["icon"],
            "color": area_data["color"],
            "emoji": area_data["emoji"]
        })
    return {"areas": areas}

class LifeAreaStatsRequest(BaseModel):
    memories: List[dict]

@api_router.post("/life-areas/stats")
async def calculate_life_area_stats(request: LifeAreaStatsRequest):
    """Calculate life area statistics from memories"""
    area_stats = {area_id: {"count": 0, "total_mood": 0, "memories": []} for area_id in LIFE_AREAS.keys()}
    
    for memory in request.memories:
        text = memory.get("transcription", "")
        mood = memory.get("mood_score", 5)
        detected_areas = detect_life_areas(text)
        
        for area in detected_areas:
            area_id = area["id"]
            area_stats[area_id]["count"] += 1
            area_stats[area_id]["total_mood"] += mood
            area_stats[area_id]["memories"].append({
                "id": memory.get("id"),
                "transcription": text[:100],
                "mood_score": mood
            })
    
    # Calculate percentages and averages
    total_mentions = sum(stats["count"] for stats in area_stats.values())
    result = []
    
    for area_id, stats in area_stats.items():
        area_data = LIFE_AREAS[area_id]
        percentage = (stats["count"] / total_mentions * 100) if total_mentions > 0 else 0
        avg_mood = (stats["total_mood"] / stats["count"]) if stats["count"] > 0 else 0
        
        result.append({
            "id": area_id,
            "name": area_data["name"],
            "icon": area_data["icon"],
            "color": area_data["color"],
            "emoji": area_data["emoji"],
            "count": stats["count"],
            "percentage": round(percentage, 1),
            "avg_mood": round(avg_mood, 1),
            "intensity": min(100, int(percentage * 2))  # Scale for visualization
        })
    
    # Sort by percentage
    result.sort(key=lambda x: x["percentage"], reverse=True)
    
    return {
        "stats": result,
        "total_mentions": total_mentions,
        "insight": generate_life_area_insight(result) if total_mentions > 5 else None
    }

def generate_life_area_insight(stats: List[dict]) -> str:
    """Generate an insight based on life area distribution"""
    if not stats:
        return ""
    
    top_area = stats[0]
    
    # Find imbalances
    has_leisure = any(s["id"] == "leisure" and s["percentage"] > 5 for s in stats)
    work_percentage = next((s["percentage"] for s in stats if s["id"] == "work"), 0)
    
    if work_percentage > 50 and not has_leisure:
        return f"Percebi que você fala muito sobre Trabalho ({work_percentage:.0f}%) mas quase não menciona Lazer. Talvez seja hora de equilibrar um pouco?"
    
    if top_area["percentage"] > 60:
        return f"Suas memórias estão muito concentradas em '{top_area['name']}' ({top_area['percentage']:.0f}%). Considere explorar outras áreas da vida."
    
    # Check for mood patterns
    high_mood_areas = [s for s in stats if s["avg_mood"] >= 7 and s["count"] >= 2]
    low_mood_areas = [s for s in stats if s["avg_mood"] <= 4 and s["count"] >= 2]
    
    if high_mood_areas and low_mood_areas:
        return f"Seu humor melhora quando fala de '{high_mood_areas[0]['name']}' (média {high_mood_areas[0]['avg_mood']}) mas cai em '{low_mood_areas[0]['name']}' (média {low_mood_areas[0]['avg_mood']}). Que tal investir mais no que te faz bem?"
    
    return f"'{top_area['name']}' é a área mais presente nas suas memórias ({top_area['percentage']:.0f}%)."

@api_router.post("/memories", response_model=MemoryResponse)
async def create_memory(memory_data: MemoryCreate, current_user: dict = Depends(get_current_user)):
    transcription = ""
    segments = []
    if memory_data.transcription and memory_data.transcription.strip():
        transcription = memory_data.transcription.strip()
        segments = create_segments_from_transcription(transcription, memory_data.duration_seconds or 0)
    elif memory_data.audio_base64:
        transcription, segments = await transcribe_audio_gemini(memory_data.audio_base64, memory_data.duration_seconds)
        if not transcription:
            transcription = "[Áudio gravado - transcrição não disponível]"
    emotion_data = await analyze_emotion(transcription)
    memory_id = str(uuid.uuid4())
    now = datetime.utcnow()
    memory = {
        "id": memory_id, 
        "user_id": current_user["id"], 
        "audio_base64": memory_data.audio_base64,
        "transcription": transcription, 
        "emotion": emotion_data["emotion"],
        "emotion_emoji": emotion_data.get("emotion_emoji", EMOTION_MAP.get(emotion_data["emotion"], "😐")), 
        "mood_score": emotion_data["mood_score"],
        "duration_seconds": memory_data.duration_seconds, 
        "detected_date": emotion_data["detected_date"],
        "memory_date": emotion_data["detected_date"], 
        "segments": segments,
        "emotions": emotion_data.get("emotions", []),
        "summary": emotion_data.get("summary", ""),
        "deleted": False,
        "created_at": now, 
        "updated_at": now
    }
    await db.memories.insert_one(memory)
    return MemoryResponse(**memory)

@api_router.get("/memories", response_model=MemoryListResponse)
async def get_memories(skip: int = 0, limit: int = 50, sort_by: str = Query("created_at", regex="^(created_at|updated_at|memory_date)$"), sort_order: str = Query("desc", regex="^(asc|desc)$"), emotion: Optional[str] = None, include_deleted: bool = False, current_user: dict = Depends(get_current_user)):
    query = {"user_id": current_user["id"]}
    if not include_deleted:
        query["deleted"] = {"$ne": True}
    if emotion:
        query["emotion"] = emotion
    sort_direction = -1 if sort_order == "desc" else 1
    cursor = db.memories.find(query).sort(sort_by, sort_direction).skip(skip).limit(limit)
    memories = await cursor.to_list(length=limit)
    total = await db.memories.count_documents(query)
    memory_list = []
    for m in memories:
        m_copy = {**m}
        m_copy["audio_base64"] = None
        m_copy.setdefault("segments", [])
        m_copy.setdefault("updated_at", m.get("created_at"))
        m_copy.setdefault("memory_date", m.get("detected_date"))
        memory_list.append(MemoryResponse(**m_copy))
    return MemoryListResponse(memories=memory_list, total=total)

@api_router.get("/memories/{memory_id}", response_model=MemoryResponse)
async def get_memory(memory_id: str, current_user: dict = Depends(get_current_user)):
    memory = await db.memories.find_one({"id": memory_id, "user_id": current_user["id"]})
    if not memory:
        raise HTTPException(status_code=404, detail="Memória não encontrada")
    memory.setdefault("segments", [])
    memory.setdefault("updated_at", memory.get("created_at"))
    memory.setdefault("memory_date", memory.get("detected_date"))
    return MemoryResponse(**memory)

@api_router.put("/memories/{memory_id}", response_model=MemoryResponse)
async def update_memory(memory_id: str, update_data: MemoryUpdate, current_user: dict = Depends(get_current_user)):
    memory = await db.memories.find_one({"id": memory_id, "user_id": current_user["id"]})
    if not memory:
        raise HTTPException(status_code=404, detail="Memória não encontrada")
    updates = {"updated_at": datetime.utcnow()}
    if update_data.transcription is not None:
        updates["transcription"] = update_data.transcription.strip()
        emotion_data = await analyze_emotion(updates["transcription"])
        updates["emotion"] = emotion_data["emotion"]
        updates["emotion_emoji"] = EMOTION_MAP.get(emotion_data["emotion"], "😐")
        updates["mood_score"] = emotion_data["mood_score"]
        updates["segments"] = create_segments_from_transcription(updates["transcription"], memory.get("duration_seconds", 0))
    if update_data.memory_date is not None:
        updates["memory_date"] = update_data.memory_date
    if update_data.deleted is not None:
        updates["deleted"] = update_data.deleted
    await db.memories.update_one({"id": memory_id}, {"$set": updates})
    updated_memory = await db.memories.find_one({"id": memory_id})
    updated_memory.setdefault("segments", [])
    updated_memory.setdefault("updated_at", updated_memory.get("created_at"))
    updated_memory.setdefault("memory_date", updated_memory.get("detected_date"))
    return MemoryResponse(**updated_memory)

@api_router.delete("/memories/{memory_id}/audio")
async def delete_memory_audio(memory_id: str, current_user: dict = Depends(get_current_user)):
    memory = await db.memories.find_one({"id": memory_id, "user_id": current_user["id"]})
    if not memory:
        raise HTTPException(status_code=404, detail="Memória não encontrada")
    await db.memories.update_one({"id": memory_id}, {"$set": {"audio_base64": None, "duration_seconds": None, "segments": [], "updated_at": datetime.utcnow()}})
    return {"message": "Áudio removido com sucesso"}

@api_router.delete("/memories/{memory_id}")
async def delete_memory(memory_id: str, current_user: dict = Depends(get_current_user)):
    result = await db.memories.delete_one({"id": memory_id, "user_id": current_user["id"]})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Memória não encontrada")
    return {"message": "Memória deletada com sucesso"}

# ==================== EXPLORATION ROUTES ====================

@api_router.get("/explore/timeline", response_model=TimelineResponse)
async def get_timeline(current_user: dict = Depends(get_current_user)):
    """Get memories organized by month for timeline view"""
    memories = await db.memories.find({"user_id": current_user["id"]}).to_list(1000)
    if not memories:
        return TimelineResponse(months=[], total_months=0)
    
    months_data = defaultdict(list)
    for m in memories:
        month_key = m["created_at"].strftime("%Y-%m")
        months_data[month_key].append(m)
    
    months = []
    for month_key in sorted(months_data.keys(), reverse=True):
        month_memories = months_data[month_key]
        avg_mood = sum(m.get("mood_score", 5) for m in month_memories) / len(month_memories)
        emotion_counts = defaultdict(int)
        for m in month_memories:
            emotion_counts[m.get("emotion", "neutro")] += 1
        dominant = max(emotion_counts.items(), key=lambda x: x[1])[0]
        year, month_num = month_key.split("-")
        month_label = f"{MONTH_NAMES[int(month_num)]} {year}"
        months.append(MonthData(
            month=month_key, month_label=month_label, count=len(month_memories),
            avg_mood=round(avg_mood, 1), dominant_emotion=dominant, dominant_emoji=EMOTION_MAP.get(dominant, "😐")
        ))
    return TimelineResponse(months=months, total_months=len(months))

@api_router.get("/explore/emotions", response_model=EmotionMapResponse)
async def get_emotion_map(current_user: dict = Depends(get_current_user)):
    """Get memories clustered by emotion for deep exploration"""
    memories = await db.memories.find({"user_id": current_user["id"]}).to_list(1000)
    if not memories:
        return EmotionMapResponse(clusters=[], total_emotions=0)
    
    emotion_memories = defaultdict(list)
    for m in memories:
        emotion_memories[m.get("emotion", "neutro")].append(m)
    
    clusters = []
    insights = {
        "feliz": "Momentos de alegria que iluminaram seu caminho",
        "triste": "Dias difíceis que você superou com coragem",
        "ansioso": "Momentos de incerteza que você atravessou",
        "calmo": "Sua paz interior registrada",
        "animado": "Sua energia vibrante capturada",
        "grato": "Gratidão que aqueceu seu coração",
        "apaixonado": "O amor que você sentiu",
        "nostálgico": "Lembranças que tocaram sua alma"
    }
    
    for emotion, mems in sorted(emotion_memories.items(), key=lambda x: -len(x[1])):
        cluster_memories = [memory_to_dict(m) for m in sorted(mems, key=lambda x: x["created_at"], reverse=True)[:5]]
        clusters.append(EmotionCluster(
            emotion=emotion, emoji=EMOTION_MAP.get(emotion, "😐"), count=len(mems),
            memories=cluster_memories, insight=insights.get(emotion)
        ))
    return EmotionMapResponse(clusters=clusters, total_emotions=len(clusters))

@api_router.get("/explore/insights", response_model=InsightsResponse)
async def get_curated_insights(current_user: dict = Depends(get_current_user)):
    """Get curated sections with personality - the app offers, with care"""
    memories = await db.memories.find({"user_id": current_user["id"]}).to_list(1000)
    sections = []
    
    if not memories:
        return InsightsResponse(sections=[])
    
    # Sort by different criteria
    by_mood = sorted(memories, key=lambda x: x.get("mood_score", 5), reverse=True)
    by_date = sorted(memories, key=lambda x: x["created_at"], reverse=True)
    
    # 1. Momentos Marcantes (high mood scores)
    highlights = [m for m in by_mood if m.get("mood_score", 5) >= 8][:5]
    if highlights:
        sections.append(CuratedSection(
            id="highlights", title="Momentos Marcantes", subtitle="Suas memórias mais luminosas",
            icon="star", color="#f59e0b",
            memories=[memory_to_dict(m) for m in highlights]
        ))
    
    # 2. Memórias de Amor
    love_emotions = ["apaixonado", "grato"]
    love_memories = [m for m in memories if m.get("emotion") in love_emotions][:5]
    if love_memories:
        sections.append(CuratedSection(
            id="love", title="Memórias de Amor", subtitle="O carinho que você guardou",
            icon="heart", color="#ec4899",
            memories=[memory_to_dict(m) for m in love_memories]
        ))
    
    # 3. Dias Difíceis que Passaram
    hard_days = [m for m in memories if m.get("mood_score", 5) <= 3]
    if hard_days:
        hard_days_sorted = sorted(hard_days, key=lambda x: x["created_at"])[:5]
        sections.append(CuratedSection(
            id="overcome", title="Dias Difíceis que Passaram", subtitle="Você foi mais forte",
            icon="fitness", color="#6366f1",
            memories=[memory_to_dict(m) for m in hard_days_sorted]
        ))
    
    # 4. Evolução Emocional (first vs recent)
    if len(memories) >= 5:
        first_memories = sorted(memories, key=lambda x: x["created_at"])[:3]
        recent_memories = by_date[:3]
        evolution = first_memories + recent_memories
        sections.append(CuratedSection(
            id="evolution", title="Sua Evolução", subtitle="De onde você veio, para onde está",
            icon="trending-up", color="#10b981",
            memories=[memory_to_dict(m) for m in evolution]
        ))
    
    # 5. Gratidão
    gratitude = [m for m in memories if m.get("emotion") == "grato"][:5]
    if gratitude:
        sections.append(CuratedSection(
            id="gratitude", title="Momentos de Gratidão", subtitle="O que aqueceu seu coração",
            icon="sunny", color="#eab308",
            memories=[memory_to_dict(m) for m in gratitude]
        ))
    
    # 6. Reflexões Calmas
    calm = [m for m in memories if m.get("emotion") == "calmo"][:5]
    if calm:
        sections.append(CuratedSection(
            id="calm", title="Paz Interior", subtitle="Seus momentos de tranquilidade",
            icon="leaf", color="#22c55e",
            memories=[memory_to_dict(m) for m in calm]
        ))
    
    return InsightsResponse(sections=sections)

@api_router.get("/explore/revisit", response_model=RevisitResponse)
async def get_revisit_suggestions(current_user: dict = Depends(get_current_user)):
    """Gentle suggestions to revisit memories - always opt-in, never invasive"""
    memories = await db.memories.find({"user_id": current_user["id"]}).to_list(1000)
    suggestions = []
    
    if not memories:
        return RevisitResponse(suggestions=[], has_suggestions=False)
    
    now = datetime.utcnow()
    
    # 1. Memory from a year ago (±7 days)
    year_ago_start = now - timedelta(days=372)
    year_ago_end = now - timedelta(days=358)
    year_ago_memories = [m for m in memories if year_ago_start <= m["created_at"] <= year_ago_end]
    if year_ago_memories:
        memory = random.choice(year_ago_memories)
        suggestions.append(RevisitSuggestion(
            id="year_ago", type="year_ago", title="Há um ano atrás...",
            subtitle="Veja o que você estava sentindo", memory=memory_to_dict(memory),
            action_text="Revisitar", icon="time"
        ))
    
    # 2. A happy memory when you might need it
    happy_memories = [m for m in memories if m.get("mood_score", 5) >= 8]
    if happy_memories:
        memory = random.choice(happy_memories)
        suggestions.append(RevisitSuggestion(
            id="happy", type="happy_memory", title="Algo que te fez feliz",
            subtitle="Quer relembrar?", memory=memory_to_dict(memory),
            action_text="Me mostre", icon="sunny"
        ))
    
    # 3. See how you thought 3 months ago
    three_months_ago = now - timedelta(days=90)
    two_months_ago = now - timedelta(days=60)
    old_memories = [m for m in memories if three_months_ago <= m["created_at"] <= two_months_ago]
    if old_memories:
        memory = random.choice(old_memories)
        suggestions.append(RevisitSuggestion(
            id="growth", type="growth", title="Há 3 meses você pensava...",
            subtitle="Veja como você mudou", memory=memory_to_dict(memory),
            action_text="Descobrir", icon="sparkles"
        ))
    
    # 4. Random rediscovery
    if len(memories) > 10:
        memory = random.choice(memories)
        suggestions.append(RevisitSuggestion(
            id="random", type="random", title="Redescubra uma memória",
            subtitle="Uma viagem no tempo aleatória", memory=memory_to_dict(memory),
            action_text="Surpreenda-me", icon="shuffle"
        ))
    
    return RevisitResponse(suggestions=suggestions[:3], has_suggestions=len(suggestions) > 0)

@api_router.get("/explore/mood-chart", response_model=MoodChartResponse)
async def get_mood_chart(days: int = 30, current_user: dict = Depends(get_current_user)):
    """Get mood data points for chart visualization"""
    since = datetime.utcnow() - timedelta(days=days)
    memories = await db.memories.find({"user_id": current_user["id"], "created_at": {"$gte": since}}).sort("created_at", 1).to_list(1000)
    
    if not memories:
        return MoodChartResponse(points=[], average=0, trend="stable")
    
    points = []
    for m in memories:
        points.append(MoodChartPoint(
            date=m["created_at"].strftime("%Y-%m-%d"),
            mood=m.get("mood_score", 5),
            emotion=m.get("emotion", "neutro")
        ))
    
    avg = sum(p.mood for p in points) / len(points)
    
    # Calculate trend
    if len(points) >= 5:
        first_half = points[:len(points)//2]
        second_half = points[len(points)//2:]
        first_avg = sum(p.mood for p in first_half) / len(first_half)
        second_avg = sum(p.mood for p in second_half) / len(second_half)
        if second_avg > first_avg + 0.5:
            trend = "up"
        elif second_avg < first_avg - 0.5:
            trend = "down"
        else:
            trend = "stable"
    else:
        trend = "stable"
    
    return MoodChartResponse(points=points, average=round(avg, 1), trend=trend)

@api_router.get("/memories/stats/overview", response_model=StatsResponse)
async def get_stats(current_user: dict = Depends(get_current_user)):
    memories = await db.memories.find({"user_id": current_user["id"]}).to_list(1000)
    if not memories:
        return StatsResponse(total_memories=0, total_duration_minutes=0, emotion_distribution=[], mood_average=0, streak_days=0)
    total = len(memories)
    total_duration = sum(m.get("duration_seconds", 0) or 0 for m in memories) / 60
    mood_avg = sum(m.get("mood_score", 5) for m in memories) / total
    emotion_counts = defaultdict(int)
    for m in memories:
        emotion_counts[m.get("emotion", "neutro")] += 1
    distribution = [EmotionStats(emotion=e, count=c, percentage=round(c/total*100, 1)) for e, c in emotion_counts.items()]
    dates = sorted(set(m["created_at"].date() for m in memories), reverse=True)
    streak = 0
    today = datetime.utcnow().date()
    for i, d in enumerate(dates):
        if d == today - timedelta(days=i):
            streak += 1
        else:
            break
    return StatsResponse(total_memories=total, total_duration_minutes=round(total_duration, 1), emotion_distribution=distribution, mood_average=round(mood_avg, 1), streak_days=streak)

# ==================== LIVING PROFILE MODELS ====================

class ProfileDimension(BaseModel):
    id: str
    title: str
    icon: str
    color: str
    insight: str
    details: Optional[str] = None
    confidence: float  # 0-1 based on data quality
    examples: List[str] = []

class ProfileEvolution(BaseModel):
    period: str  # "now", "3_months", "6_months"
    label: str
    summary: str
    key_changes: List[str] = []

class ReflectionQuestion(BaseModel):
    id: str
    question: str
    context: str
    related_dimension: str

class LivingProfileResponse(BaseModel):
    user_id: str
    generated_at: datetime
    memory_count: int
    profile_level: str  # "basic", "intermediate", "complete"
    dimensions: List[ProfileDimension]
    evolution: List[ProfileEvolution]
    reflections: List[ReflectionQuestion]
    summary: str
    last_updated: Optional[datetime] = None

# ==================== LIVING PROFILE ROUTES ====================

PROFILE_ANALYSIS_PROMPT = """Você é um psicólogo humanista especializado em análise de personalidade e padrões emocionais. 
Analise as memórias abaixo de um diário pessoal e crie um perfil psicológico profundo, mas gentil e não-diagnóstico.

MEMÓRIAS DO USUÁRIO (em ordem cronológica):
{memories_text}

---

Analise as seguintes 8 dimensões e retorne um JSON estruturado:

1. **cognitive_identity**: Como a pessoa pensa (lógico, emocional, estratégico, intuitivo), grau de planejamento vs espontaneidade
2. **emotional_patterns**: Emoções mais frequentes, emoções evitadas, mudanças ao longo do tempo
3. **logic_emotion_balance**: Quando racionaliza emoções, evita vulnerabilidade, fala de sentimentos indiretamente
4. **under_pressure**: Como reage ao estresse (isolamento, controle, silêncio, rigidez)
5. **core_values**: O que defende, o que gera orgulho/frustração, o que não negocia
6. **relationships**: Como fala de parceiros, amigos, família; expectativas implícitas
7. **self_criticism**: Padrões de cobrança pessoal, insatisfação com progresso
8. **work_life_balance**: Relação com descanso, culpa associada a lazer, foco em produtividade

Para cada dimensão, forneça:
- insight: Uma frase reveladora em linguagem humana (NÃO clínica)
- details: Explicação mais profunda (2-3 frases)
- confidence: 0.0 a 1.0 baseado na quantidade de evidências
- examples: 1-2 trechos das memórias que suportam a análise

Também forneça:
- summary: Um parágrafo resumindo quem é essa pessoa agora
- evolution: Mudanças observadas ao longo do tempo (se houver dados suficientes)
- reflections: 2-3 perguntas reflexivas gentis para o usuário (não correção, apenas convite à consciência)

IMPORTANTE:
- Use linguagem calorosa, não diagnóstica
- Não rotule, espelhe
- Foque em padrões, não julgamentos
- Seja gentil mas honesto
- Se não houver dados suficientes para uma dimensão, indique baixa confiança

Retorne APENAS o JSON válido no formato especificado."""

async def analyze_profile_with_ai(memories: List[dict], user_id: str) -> dict:
    """Deep AI analysis of user memories to build living profile"""
    if not memories:
        return None
    
    # Prepare memories text
    memories_text = ""
    for i, m in enumerate(memories, 1):
        date_str = m["created_at"].strftime("%d/%m/%Y") if isinstance(m["created_at"], datetime) else str(m["created_at"])
        emotion = m.get("emotion", "neutro")
        mood = m.get("mood_score", 5)
        text = m.get("transcription", "")[:500]  # Limit each memory
        memories_text += f"\n[Memória {i} - {date_str} | Emoção: {emotion} | Humor: {mood}/10]\n{text}\n"
    
    try:
        if not gemini_client:
            logger.warning("Gemini client not available for profile analysis")
            return None
        
        prompt = PROFILE_ANALYSIS_PROMPT.format(memories_text=memories_text)
        
        response = gemini_client.models.generate_content(
            model="gemini-2.0-flash",
            contents=[prompt]
        )
        
        # Parse JSON response
        response_text = response.text.strip()
        if response_text.startswith("```"):
            response_text = response_text.split("```")[1]
            if response_text.startswith("json"):
                response_text = response_text[4:]
        if response_text.endswith("```"):
            response_text = response_text[:-3]
        
        logger.info("Profile analysis completed with Gemini")
        return json.loads(response_text.strip())
    except Exception as e:
        logger.error(f"Profile analysis error with Gemini: {e}")
        return None

def build_profile_response(analysis: dict, memories: List[dict], user_id: str) -> LivingProfileResponse:
    """Build structured profile response from AI analysis"""
    memory_count = len(memories)
    
    # Determine profile level
    if memory_count >= 30:
        profile_level = "complete"
    elif memory_count >= 10:
        profile_level = "intermediate"
    else:
        profile_level = "basic"
    
    # Dimension config
    dimension_config = {
        "cognitive_identity": {"title": "Identidade Cognitiva", "icon": "brain", "color": "#8b5cf6"},
        "emotional_patterns": {"title": "Padrões Emocionais", "icon": "heart", "color": "#ec4899"},
        "logic_emotion_balance": {"title": "Lógica & Emoção", "icon": "scale", "color": "#6366f1"},
        "under_pressure": {"title": "Sob Pressão", "icon": "flame", "color": "#f97316"},
        "core_values": {"title": "Valores Centrais", "icon": "diamond", "color": "#14b8a6"},
        "relationships": {"title": "Relacionamentos", "icon": "people", "color": "#f43f5e"},
        "self_criticism": {"title": "Autocrítica", "icon": "fitness", "color": "#eab308"},
        "work_life_balance": {"title": "Equilíbrio", "icon": "leaf", "color": "#22c55e"}
    }
    
    dimensions = []
    if analysis:
        for dim_id, config in dimension_config.items():
            dim_data = analysis.get(dim_id, {})
            dimensions.append(ProfileDimension(
                id=dim_id,
                title=config["title"],
                icon=config["icon"],
                color=config["color"],
                insight=dim_data.get("insight", "Ainda coletando dados para esta dimensão..."),
                details=dim_data.get("details"),
                confidence=dim_data.get("confidence", 0.3 if memory_count < 10 else 0.6),
                examples=dim_data.get("examples", [])[:2]
            ))
    else:
        # Default dimensions when no analysis available
        for dim_id, config in dimension_config.items():
            dimensions.append(ProfileDimension(
                id=dim_id,
                title=config["title"],
                icon=config["icon"],
                color=config["color"],
                insight="Continue gravando memórias para descobrir este aspecto de você.",
                confidence=0.1,
                examples=[]
            ))
    
    # Evolution
    evolution = []
    if analysis and analysis.get("evolution"):
        ev_data = analysis["evolution"]
        if isinstance(ev_data, list):
            for ev in ev_data:
                if isinstance(ev, dict):
                    evolution.append(ProfileEvolution(
                        period=ev.get("period", "now"),
                        label=ev.get("label", "Agora"),
                        summary=ev.get("summary", ""),
                        key_changes=ev.get("key_changes", []) if isinstance(ev.get("key_changes"), list) else []
                    ))
    
    # Reflections
    reflections = []
    if analysis and analysis.get("reflections"):
        ref_data = analysis["reflections"]
        if isinstance(ref_data, list):
            for i, ref in enumerate(ref_data[:3]):
                if isinstance(ref, dict):
                    reflections.append(ReflectionQuestion(
                        id=f"reflection_{i}",
                        question=ref.get("question", ""),
                        context=ref.get("context", ""),
                        related_dimension=ref.get("related_dimension", "")
                    ))
                elif isinstance(ref, str):
                    reflections.append(ReflectionQuestion(
                        id=f"reflection_{i}",
                        question=ref,
                        context="",
                        related_dimension=""
                    ))
    
    summary = analysis.get("summary", "Continue compartilhando suas memórias para que possamos conhecer você melhor.") if analysis else "Continue compartilhando suas memórias para que possamos conhecer você melhor."
    
    return LivingProfileResponse(
        user_id=user_id,
        generated_at=datetime.utcnow(),
        memory_count=memory_count,
        profile_level=profile_level,
        dimensions=dimensions,
        evolution=evolution,
        reflections=reflections,
        summary=summary
    )

@api_router.get("/profile/living", response_model=LivingProfileResponse)
async def get_living_profile(force_refresh: bool = False, current_user: dict = Depends(get_current_user)):
    """Get or generate the user's living profile"""
    user_id = current_user["id"]
    
    # Check for cached profile (less than 24h old and not forcing refresh)
    if not force_refresh:
        cached = await db.profiles.find_one({
            "user_id": user_id,
            "generated_at": {"$gte": datetime.utcnow() - timedelta(hours=24)}
        })
        if cached:
            cached.pop("_id", None)
            return LivingProfileResponse(**cached)
    
    # Get all user memories
    memories = await db.memories.find({"user_id": user_id}).sort("created_at", 1).to_list(1000)
    
    if len(memories) < 3:
        # Not enough memories for meaningful analysis
        return build_profile_response(None, memories, user_id)
    
    # Generate new analysis
    analysis = await analyze_profile_with_ai(memories, user_id)
    profile = build_profile_response(analysis, memories, user_id)
    
    # Cache the profile
    profile_dict = profile.dict()
    profile_dict["_id"] = f"profile_{user_id}"
    await db.profiles.replace_one(
        {"user_id": user_id},
        profile_dict,
        upsert=True
    )
    
    return profile

@api_router.post("/profile/refresh", response_model=LivingProfileResponse)
async def refresh_living_profile(current_user: dict = Depends(get_current_user)):
    """Force refresh the user's living profile"""
    return await get_living_profile(force_refresh=True, current_user=current_user)

@api_router.get("/profile/dimension/{dimension_id}")
async def get_dimension_detail(dimension_id: str, current_user: dict = Depends(get_current_user)):
    """Get detailed view of a specific dimension with examples"""
    user_id = current_user["id"]
    
    # Get cached profile
    cached = await db.profiles.find_one({"user_id": user_id})
    if not cached:
        raise HTTPException(status_code=404, detail="Perfil não encontrado. Gere um perfil primeiro.")
    
    dimensions = cached.get("dimensions", [])
    dimension = next((d for d in dimensions if d["id"] == dimension_id), None)
    
    if not dimension:
        raise HTTPException(status_code=404, detail="Dimensão não encontrada")
    
    return dimension

class ChallengeValidateRequest(BaseModel):
    audio_base64: str
    challenge_text: str

class ChallengeValidateResponse(BaseModel):
    success: bool
    reward_xp: int
    feedback: str
    transcription: str
    memory_data: Optional[Dict[str, Any]] = None

@api_router.post("/validate_challenge", response_model=ChallengeValidateResponse)
async def validate_challenge(req: ChallengeValidateRequest):
    """Validate a user's answer to a daily challenge"""
    try:
        # 1. Decode generic properties for Google Speech API (same behavior as transcribe)
        if "," in req.audio_base64:
            b64_data = req.audio_base64.split(",")[1]
        else:
            b64_data = req.audio_base64
            
        audio_content = base64.b64decode(b64_data)
        
        # 2. Extract transcription using Google SDK wrapper
        transcription, _ = await transcribe_audio_gemini(b64_data)
        
        # 3. Use gemini ai to validate the answer
        if not gemini_client:
            raise Exception("Gemini API not configured")

        prompt = f"""
        Você é o "Diário de Voz", uma inteligência artificial terapêutica e empática.
        O usuário tentou responder a um Desafio Diário.
        
        Desafio proposto: "{req.challenge_text}"
        Resposta do usuário (transcrita por voz): "{transcription}"
        
        Analise a resposta do usuário e me diga se ela tangencia minimamente o tema do desafio.
        Seja flexível! Usuários podem desabafar indiretamente. Se o usuário falou algo irrelevante (ex: "teste, testando microfone" ou "não sei o que dizer"), falhe o desafio e incentive-o de forma gentil.
        NEUTRALIDADE RELIGIOSA: A IA DEVE ser estritamente laica. JAMAIS presuma crenças, mencione Deus, orações ou religião. Fale apenas de resiliência e psicologia.
        LIMITES DA IA: Aja como um analista de escuta humilde. NUNCA aja como um Guru que tem respostas ou conselhos definitivos de vida, e não aja como um vidente. NÃO afirme com absoluta certeza o estado do usuário (ex: "Parece que você tem um vazio..."). NUNCA presuma fatos da vida dele que não relatou claramente. Apenas reflita e valide com palavras curtas e encorajadoras o que ele já entregou.
        
        
        Responda ESTRITAMENTE em formato JSON com a seguinte estrutura:
        {{
            "success": boolean (true se aceitável, false se irrelevante),
            "feedback": "Sua mensagem amigável e acolhedora em 1 a 2 parágrafos. Se success, parabenize-o e aborde sobre o que ele falou. Se false, incentive a gravar de novo dizendo por que não contou.",
            "emotion": "A emoção primária detectada num adjetivo (ex: Reflexivo)",
            "emoji": "Um emoji que represente",
            "score": Inteiro de 1 a 10 representando o humor/humor da pessoa
        }}
        """
        
        response = gemini_client.models.generate_content(
            model='gemini-2.0-flash',
            contents=prompt
        )
        raw_text = response.text.strip()
        
        # clean block code
        if raw_text.startswith("```json"):
            raw_text = raw_text[7:-3].strip()
        elif raw_text.startswith("```"):
            raw_text = raw_text[3:-3].strip()
            
        ai_data = json.loads(raw_text)
        
        return ChallengeValidateResponse(
            success=ai_data.get("success", True),
            reward_xp=50 if ai_data.get("success", True) else 0,
            feedback=ai_data.get("feedback", "Obrigado por compartilhar! Aqui estão seus XP."),
            transcription=transcription,
            memory_data={
                "emotion": ai_data.get("emotion", "Reflexivo"),
                "emoji": ai_data.get("emoji", "🤔"),
                "score": ai_data.get("score", 5),
                "summary": ai_data.get("feedback", "")
            }
        )
            
    except Exception as e:
        logger.error(f"Error validating challenge: {e}")
        # fallback is to accept it
        return ChallengeValidateResponse(
            success=True,
            reward_xp=50,
            feedback="Obrigado por completar o desafio de hoje! (Salvo em modo offline)",
            transcription="[Erro de comunicação, transcrição offline.]",
            memory_data={
                "emotion": "Tranquilo",
                "emoji": "😌",
                "score": 5,
                "summary": "Desafio salvo offline."
            }
        )

# ==================== ADMIN AUTH ===================="

# Admin credentials (in production, use environment variables)
ADMIN_USERNAME = "admin001"
ADMIN_PASSWORD_HASH = bcrypt.hashpw("admin2228@".encode('utf-8'), bcrypt.gensalt()).decode('utf-8')

class AdminLogin(BaseModel):
    username: str
    password: str

class AdminTokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: dict

@api_router.post("/auth/admin/login", response_model=AdminTokenResponse)
async def admin_login(credentials: AdminLogin):
    """Admin login with username and password"""
    if credentials.username != ADMIN_USERNAME:
        raise HTTPException(status_code=401, detail="Usuário ou senha incorretos")
    
    if not bcrypt.checkpw(credentials.password.encode('utf-8'), ADMIN_PASSWORD_HASH.encode('utf-8')):
        raise HTTPException(status_code=401, detail="Usuário ou senha incorretos")
    
    # Create admin user object
    admin_user = {
        "id": "admin_001",
        "email": "admin@diariodevoz.app",
        "name": "Administrador",
        "role": "admin",
        "created_at": datetime.utcnow().isoformat()
    }
    
    # Create token
    token = create_token(admin_user["id"])
    
    return AdminTokenResponse(
        access_token=token,
        user=admin_user
    )

# ==================== HEALTH CHECK ====================

# ==================== CHAT RAG (COPILOT) ====================

async def generate_chat_response(message: str, persona: str, memories: List[MemoryContext], user_context: Optional[UserContext] = None) -> str:
    """Generate a chat response using Gemini with memory context (RAG)"""
    try:
        if not gemini_client:
            return "Desculpe, o serviço de IA não está disponível no momento. Tente novamente mais tarde."
        
        # Get persona data
        persona_data = LISTENING_PERSONAS.get(persona, LISTENING_PERSONAS["therapeutic"])
        
        # Build memory context string
        if not memories:
            return f"Olá! 👋 Ainda não tenho memórias suas para analisar.\n\nPara que eu possa te conhecer melhor e responder suas perguntas sobre sua vida emocional, comece gravando alguns momentos no seu Diário de Voz.\n\nVá na aba 'Gravar' e compartilhe como está se sentindo hoje! 🎤"
        
        # Format memories chronologically for context
        memory_context_lines = []
        for mem in sorted(memories, key=lambda x: x.createdAt, reverse=True)[:30]:  # Last 30 memories
            date_str = mem.createdAt.split('T')[0] if 'T' in mem.createdAt else mem.createdAt
            memory_context_lines.append(
                f"ID: {mem.id} | [{date_str}] Emoção: {mem.emotion} {mem.emotionEmoji} (Humor: {mem.moodScore}/10) - {mem.transcription[:200]}{'...' if len(mem.transcription) > 200 else ''}"
            )
        
        memory_context = "\n".join(memory_context_lines)
        
        # Build user profile context
        user_profile_bio = ""
        if user_context:
            parts = []
            if user_context.name: parts.append(f"Nome do usuário: {user_context.name}")
            if user_context.birth_date: parts.append(f"Data de nascimento: {user_context.birth_date}")
            if user_context.goal: parts.append(f"Propósito no app: {user_context.goal}")
            if parts:
                user_profile_bio = "DADOS DO PERFIL DO USUÁRIO:\n" + "\n".join(parts) + "\n\n"

        # Custom persona adjustments for more human feel
        persona_behavior = {
            "therapeutic": "Você é um terapeuta empático e gentil. Use uma linguagem acolhedora, valide os sentimentos e faça perguntas reflexivas leves. Evite clichês de autoajuda vazios.",
            "analytical": "Você é um analista de padrões comportamentais. Foque em observar tendências nas memórias, correlações entre eventos e sentimentos, de forma objetiva mas empática.",
            "stoic": "Você é um mentor estoico. Foca no que está sob nosso controle, na resiliência e na sabedoria prática para lidar com as adversidades com serenidade.",
            "friend": "Você é um melhor amigo de longa data. Use linguagem informal (brasileira), seja companheiro, ouça sem julgar e dê apoio emocional como alguém que realmente se importa."
        }.get(persona, "Você é um assistente pessoal focado em bem-estar emocional.")

        prompt = f"""Você é o 'Eu Digital' do usuário, atuando como a persona: {persona_behavior}
        
INFORMAÇÕES DO USUÁRIO:
Nome: {user_context.name if user_context else 'Usuário'}
Objetivo: {user_context.goal if user_context else 'Autoconhecimento'}

Abaixo estão as memórias recentes do usuário (contexto):
{memory_context}

O usuário disse agora: "{message}"

DIRETRIZES TÉCNICAS E DE ESTILO:
1. FALE COMO HUMANO: Evite "Como uma IA", "Aqui está minha análise" ou "Segundo meus dados". Responda direto: "Lembro que você...", "Sinto que...", "Isso conecta com...".
2. SEJA UM COMPANHEIRO, NÃO UM GURU: Não tente prever o futuro nem agir como vidente. Apenas ouça, valide e conecte com o histórico do usuário.
3. NEUTRALIDADE RELIGIOSA: DEVE ser estritamente laico. JAMAIS mencione Deus, forças superiores ou religião.
4. SEGURANÇA (CRÍTICO): Se houver intenção de crime ou risco IMINENTE de vida/suicídio, DEVE iniciar com "[ALERTA_SENSIVEL]" e ser direto sobre ajuda profissional.
5. Se o usuário falar sobre algo insano ou perigoso (mesmo que não iminente), seja acolhedor mas firme em alertar sobre o risco à segurança dele.
6. CITAÇÕES: Quando citar uma memória, finalize o parágrafo com {{{{ID_DA_MEMORIA}}}}.
7. Conciso: No máximo 4 parágrafos.
"""

        response = gemini_client.models.generate_content(
            model="gemini-2.0-flash",
            contents=[prompt]
        )
        
        return response.text.strip()
        
    except Exception as e:
        logger.error(f"Chat generation error: {e}")
        return "Desculpe, ocorreu um erro ao processar sua mensagem. Por favor, tente novamente."

@api_router.post("/transcribe", response_model=TranscribeResponse)
async def transcribe_only(request: TranscribeRequest):
    """Transcription endpoint for chat/temp inputs"""
    if not request.audio_base64:
        raise HTTPException(status_code=400, detail="Audio base64 is required")
    
    transcription, segments = await transcribe_audio_gemini(request.audio_base64, request.duration_seconds)
    
    return TranscribeResponse(
        transcription=transcription,
        segments=segments
    )

@api_router.post("/validate_challenge", response_model=ChallengeValidationResponse)
async def validate_challenge(request: ChallengeValidationRequest):
    """
    Validates if the user's audio matches the daily challenge intent.
    Uses AI to analyze the content and provide feedback.
    """
    if not request.audio_base64:
        raise HTTPException(status_code=400, detail="Audio base64 is required")
    
    # 1. Transcribe the audio
    transcription, _ = await transcribe_audio_gemini(request.audio_base64)
    
    if not transcription or len(transcription.strip()) < 5:
        return ChallengeValidationResponse(
            success=False,
            message="Áudio muito curto ou incompreensível.",
            feedback="Poxa, não consegui entender bem o que você disse. Tente falar um pouco mais devagar ou aproximar o celular.",
            transcription=transcription or ""
        )
    
    # 2. Use AI to validate intent
    prompt = f"""Você é um validador de desafios diários do app Diário de Voz.
    O usuário recebeu o seguinte desafio: "{request.challenge_text}"
    O usuário gravou a seguinte mensagem: "{transcription}"
    
    Analise se o que o usuário disse realmente responde ao desafio proposto.
    
    Regras de Validação:
    - Se o usuário apenas falou "teste", "blá blá blá" ou fugiu completamente de responder a pergunta do desafio, SUCCESS = False.
    - Se o usuário respondeu de forma honesta (mesmo que curta) ao desafio, SUCCESS = True.
    - Seja generoso. Se houver esforço em responder, valide.
    
    FEEDBACK:
    - Se for sucesso: Dê um parabéns curto e uma frase motivadora relacionada ao que ele falou.
    - Se falha: Explique gentilmente que a resposta não pareceu relacionada ao desafio e peça para tentar novamente sendo mais específico.
    
    Responda APENAS em JSON no formato:
    {{
        "success": boolean,
        "feedback": "string curta e humana",
        "emotion": "string (ex: Feliz, Reflexivo...)",
        "emoji": "string (emoji correspondente)",
        "score": number (1-10 de felicidade)
    }}
    """
    
    try:
        response = gemini_client.models.generate_content(
            model="gemini-2.0-flash",
            contents=[prompt],
            config={
                'response_mime_type': 'application/json',
            }
        )
        
        import json
        result = json.loads(response.text)
        
        return ChallengeValidationResponse(
            success=result.get("success", False),
            message="Validação concluída",
            feedback=result.get("feedback", "Obrigado por compartilhar!"),
            transcription=transcription,
            memory_data={
                "emotion": result.get("emotion", "Reflexivo"),
                "emoji": result.get("emoji", "🤔"),
                "score": result.get("score", 5)
            }
        )
        
    except Exception as e:
        logger.error(f"Challenge validation error: {e}")
        return ChallengeValidationResponse(
            success=True, # Fallback to success on error to not block user
            message="Erro na validação IA, mas registramos seu esforço!",
            feedback="Obrigado por cumprir o desafio de hoje!",
            transcription=transcription
        )

@api_router.post("/chat/memories", response_model=ChatResponse)
async def chat_with_memories(chat_data: ChatMessage):
    """
    Chat endpoint that uses RAG (Retrieval-Augmented Generation) to respond
    based on the user's memory context. 
    
    This is a public endpoint for offline-first architecture where
    the frontend sends the memories directly.
    """
    logger.info(f"Chat request - Persona: {chat_data.persona}, Memories: {len(chat_data.memories)}, Message: {chat_data.message[:50]}...")
    
    response_text = await generate_chat_response(
        message=chat_data.message,
        persona=chat_data.persona,
        memories=chat_data.memories,
        user_context=chat_data.user_context
    )
    
    return ChatResponse(
        response=response_text,
        persona_used=chat_data.persona,
        memories_analyzed=len(chat_data.memories)
    )

@api_router.get("/")
async def root():
    return {"message": "Diário de Voz API", "status": "online"}

@api_router.get("/health")
async def health():
    return {"status": "healthy", "timestamp": datetime.utcnow().isoformat()}

app.include_router(api_router)
app.add_middleware(CORSMiddleware, allow_credentials=True, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

@app.on_event("shutdown")
async def shutdown_db_client():
    if client:
        client.close()
