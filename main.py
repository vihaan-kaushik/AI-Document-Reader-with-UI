import os
import shutil
import pathlib
import uvicorn
import warnings
from typing import List
from contextlib import asynccontextmanager

from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

# --- NEW LANGCHAIN v0.3 IMPORTS (Critical for the fix) ---
from langchain_core.documents import Document 
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_community.vectorstores import FAISS
from langchain_community.embeddings import HuggingFaceEmbeddings
from langchain_community.document_loaders import PyPDFLoader, Docx2txtLoader, TextLoader
from langchain_ollama import ChatOllama

# PPTX support
from pptx import Presentation

# Suppress warnings
warnings.filterwarnings("ignore")

# --- GLOBAL STATE ---
class GlobalState:
    text_generator = None # Holds the Ollama Client
    vectorstore = None
    retriever = None
    embeddings = None

state = GlobalState()

# --- 1. INITIALIZE OLLAMA ---
def load_llm():
    print("⏳ Connecting to Ollama...")
    try:
        # Connects to the local Ollama app running on your PC
        llm = ChatOllama(
            model="llama3.2", 
            temperature=0.7,
        )
        print("✅ Connected to Ollama.")
        return llm
    except Exception as e:
        print(f"❌ Could not connect to Ollama: {e}")
        return None

# --- 2. DOCUMENT LOADERS ---
def load_pptx(path: str):
    texts = []
    try:
        prs = Presentation(path)
        for idx, slide in enumerate(prs.slides, start=1):
            parts = []
            for shape in slide.shapes:
                if hasattr(shape, "text") and shape.text:
                    parts.append(shape.text)
            slide_text = "\n".join(parts).strip()
            if slide_text:
                texts.append(Document(page_content=slide_text, metadata={"source": path, "slide": idx}))
    except Exception as e:
        print(f"⚠️ Error loading PPTX {path}: {e}")
    return texts

def load_documents_safely(paths):
    docs = []
    for p in paths:
        ext = pathlib.Path(p).suffix.lower()
        try:
            if ext == ".pdf":
                docs.extend(PyPDFLoader(p).load())
            elif ext == ".docx":
                docs.extend(Docx2txtLoader(p).load())
            elif ext in [".txt", ".md"]:
                docs.extend(TextLoader(p, encoding="utf-8", autodetect_encoding=True).load())
            elif ext == ".pptx":
                docs.extend(load_pptx(p))
            else:
                print(f"⚠️ Skipping unsupported extension: {p}")
        except Exception as e:
            print(f"⚠️ Failed to load {p}: {e}")
    return docs

# --- 3. LIFESPAN (Startup/Shutdown) ---
@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup Logic
    print("🚀 Starting Application...")
    
    # 1. Load Ollama
    state.text_generator = load_llm()
    
    # 2. Load Embeddings (Runs on CPU, needed for PDF search)
    print("⏳ Loading Embeddings Model...")
    state.embeddings = HuggingFaceEmbeddings(model_name="sentence-transformers/all-MiniLM-L6-v2")
    print("✅ Embeddings Ready.")
    
    yield
    # Shutdown Logic
    print("🛑 Shutting down...")

# --- 4. FASTAPI SETUP ---
app = FastAPI(lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], 
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- SCHEMAS ---
class ChatRequest(BaseModel):
    message: str

# --- ENDPOINTS ---

@app.post("/upload")
async def upload_files(files: List[UploadFile] = File(...)):
    temp_dir = "temp_uploads"
    if os.path.exists(temp_dir):
        shutil.rmtree(temp_dir)
    os.makedirs(temp_dir)

    saved_paths = []
    try:
        # Save uploaded files
        for file in files:
            file_path = os.path.join(temp_dir, file.filename)
            with open(file_path, "wb") as f:
                shutil.copyfileobj(file.file, f)
            saved_paths.append(file_path)

        # Process documents
        docs = load_documents_safely(saved_paths)
        
        # --- FIX: Check for empty docs specifically ---
        if not docs:
            # Check if user uploaded a .ppt file by mistake
            if any(f.filename.endswith(".ppt") for f in files):
                 raise HTTPException(status_code=400, detail="Error: .ppt files (old format) are not supported. Please convert to .pptx and try again.")
            
            raise HTTPException(status_code=400, detail="No readable text found in the uploaded files.")

        # Split text for FAISS
        splitter = RecursiveCharacterTextSplitter(chunk_size=1000, chunk_overlap=200)
        splits = splitter.split_documents(docs)

        # Create Search Index
        state.vectorstore = FAISS.from_documents(splits, embedding=state.embeddings)
        state.retriever = state.vectorstore.as_retriever(search_kwargs={"k": 3})

        return {"status": "success", "message": f"Processed {len(files)} files into {len(splits)} chunks."}

    # --- FIX: Catch HTTPException separately so it passes through ---
    except HTTPException as he:
        raise he 
    except Exception as e:
        print(f"Upload Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if os.path.exists(temp_dir):
            shutil.rmtree(temp_dir)
@app.post("/chat")
def chat_endpoint(request: ChatRequest):
    print(f"📩 Received query: {request.message}") 

    if not state.retriever:
        raise HTTPException(status_code=400, detail="No documents uploaded yet.")
    
    if not state.text_generator:
         raise HTTPException(status_code=500, detail="Ollama is not connected.")

    query = request.message
    
    # 1. Retrieve Context
    # Use 'invoke' which is the standard for LangChain v0.3
    ctx_docs = state.retriever.invoke(query)
    context_text = "\n\n".join([d.page_content[:1000] for d in ctx_docs]) 

    # 2. Stream Answer from Ollama
    print("🤖 Streaming from Ollama...")
    
    def iter_stream():
        messages = [
            ("system", "You are a helpful AI assistant. Use the context provided to answer the question briefly."),
            ("human", f"Context:\n{context_text}\n\nQuestion: {query}")
        ]
        
        # Stream the response chunks
        try:
            for chunk in state.text_generator.stream(messages):
                yield chunk.content
        except Exception as e:
            yield f"\n[Error: Ensure Ollama is running! {e}]"

    return StreamingResponse(iter_stream(), media_type="text/plain")

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)