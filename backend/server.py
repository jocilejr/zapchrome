import asyncio
from fastapi import FastAPI, APIRouter, HTTPException
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field
from typing import List, Optional
import uuid
from datetime import datetime
from openai import OpenAI


ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

openai_api_key = os.environ.get('OPENAI_API_KEY')
openai_model = os.environ.get('OPENAI_MODEL', 'gpt-4o-mini')
openai_client: Optional[OpenAI] = None

if openai_api_key:
    openai_client = OpenAI(api_key=openai_api_key)

# Create the main app without a prefix
app = FastAPI()

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")


# Define Models
class StatusCheck(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    client_name: str
    timestamp: datetime = Field(default_factory=datetime.utcnow)

class StatusCheckCreate(BaseModel):
    client_name: str


class ChatRequest(BaseModel):
    question: str
    context: Optional[str] = None


class ChatResponse(BaseModel):
    answer: str


# Add your routes to the router instead of directly to app
@api_router.get("/")
async def root():
    return {"message": "Hello World"}

@api_router.post("/status", response_model=StatusCheck)
async def create_status_check(input: StatusCheckCreate):
    status_dict = input.dict()
    status_obj = StatusCheck(**status_dict)
    _ = await db.status_checks.insert_one(status_obj.dict())
    return status_obj

@api_router.get("/status", response_model=List[StatusCheck])
async def get_status_checks():
    status_checks = await db.status_checks.find().to_list(1000)
    return [StatusCheck(**status_check) for status_check in status_checks]


@api_router.post("/ask", response_model=ChatResponse)
async def ask_openai(request: ChatRequest):
    if not request.question.strip():
        raise HTTPException(status_code=400, detail="A pergunta não pode estar vazia.")

    if openai_client is None:
        raise HTTPException(
            status_code=503,
            detail="O serviço de linguagem não está configurado. Defina OPENAI_API_KEY.",
        )

    prompt = request.question.strip()
    if request.context:
        prompt = f"{request.context.strip()}\n\nPergunta: {prompt}"

    loop = asyncio.get_running_loop()

    try:
        response = await loop.run_in_executor(
            None,
            lambda: openai_client.responses.create(
                model=openai_model,
                input=prompt,
            ),
        )
    except Exception as exc:  # pragma: no cover - network failure path
        logger.exception("Erro ao consultar o OpenAI: %s", exc)
        raise HTTPException(
            status_code=502,
            detail="Não foi possível obter uma resposta do modelo de linguagem.",
        ) from exc

    answer_text = (response.output_text or "").strip()

    if not answer_text:
        raise HTTPException(
            status_code=502,
            detail="O modelo de linguagem não retornou conteúdo.",
        )

    return ChatResponse(answer=answer_text)

# Include the router in the main app
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
