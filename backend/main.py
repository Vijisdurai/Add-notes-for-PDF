from fastapi import FastAPI, HTTPException, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pydantic import BaseModel
from typing import List, Optional
import sqlite3
import os
import hashlib
from pathlib import Path

# Models
class NoteCreate(BaseModel):
    doc_id: str
    page: int
    x: float
    y: float
    content: str

class Note(NoteCreate):
    id: int

# DB Setup
DB_PATH = "./notes.db"
INIT_DB_SQL = """
CREATE TABLE IF NOT EXISTS notes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    doc_id TEXT NOT NULL,
    page INTEGER NOT NULL,
    x REAL NOT NULL,
    y REAL NOT NULL,
    content TEXT NOT NULL
)
"""

def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    with get_db() as db:
        db.execute(INIT_DB_SQL)
        db.commit()

init_db()

# App Setup
app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Ensure uploads directory
UPLOAD_DIR = Path("uploads")
UPLOAD_DIR.mkdir(exist_ok=True)

# Serve static files - must be before route definitions
app.mount("/uploads", StaticFiles(directory="uploads"), name="uploads")
app.mount("/static", StaticFiles(directory="../frontend"), name="frontend")

@app.get("/")
def read_root():
    return FileResponse("../frontend/index.html")

@app.get("/health")
def health():
    return {"status": "ok"}

@app.post("/notes", response_model=Note)
def create_note(note: NoteCreate):
    print(f"Creating note: {note}")
    try:
        with get_db() as db:
            cur = db.execute("INSERT INTO notes (doc_id, page, x, y, content) VALUES (?, ?, ?, ?, ?)",
                            (note.doc_id, note.page, note.x, note.y, note.content))
            db.commit()
            note_id = cur.lastrowid
            print(f"Note created with ID: {note_id}")
        return Note(id=note_id, **note.dict())
    except Exception as e:
        print(f"Error creating note: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to create note: {str(e)}")

@app.get("/notes", response_model=List[Note])
def list_notes(doc_id: str, page: Optional[int] = None):
    with get_db() as db:
        if page is not None:
            rows = db.execute("SELECT * FROM notes WHERE doc_id=? AND page=?", (doc_id, page)).fetchall()
        else:
            rows = db.execute("SELECT * FROM notes WHERE doc_id=?", (doc_id,)).fetchall()
    return [Note(**dict(r)) for r in rows]

@app.put("/notes/{note_id}", response_model=Note)
def update_note(note_id: int, note: NoteCreate):
    print(f"Updating note {note_id}: {note}")
    try:
        with get_db() as db:
            # Check if note exists
            existing = db.execute("SELECT * FROM notes WHERE id=?", (note_id,)).fetchone()
            if not existing:
                raise HTTPException(status_code=404, detail=f"Note with ID {note_id} not found")
                
            db.execute("UPDATE notes SET doc_id=?, page=?, x=?, y=?, content=? WHERE id=?",
                      (note.doc_id, note.page, note.x, note.y, note.content, note_id))
            db.commit()
            print(f"Note {note_id} updated successfully")
        return Note(id=note_id, **note.dict())
    except HTTPException as e:
        raise e
    except Exception as e:
        print(f"Error updating note: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to update note: {str(e)}")

@app.delete("/notes/{note_id}")
def delete_note(note_id: int):
    print(f"Deleting note {note_id}")
    try:
        with get_db() as db:
            # Check if note exists
            existing = db.execute("SELECT * FROM notes WHERE id=?", (note_id,)).fetchone()
            if not existing:
                raise HTTPException(status_code=404, detail=f"Note with ID {note_id} not found")
                
            db.execute("DELETE FROM notes WHERE id=?", (note_id,))
            db.commit()
            print(f"Note {note_id} deleted successfully")
        return {"ok": True, "message": f"Note {note_id} deleted successfully"}
    except HTTPException as e:
        raise e
    except Exception as e:
        print(f"Error deleting note: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to delete note: {str(e)}")

@app.post("/upload")
async def upload_pdf(file: UploadFile = File(...)):
    if not file.filename.endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are allowed")
        
    content = await file.read()
    file_hash = hashlib.sha256(content).hexdigest()
    print(f"File hash: {file_hash}")
    
    # Store original filename
    FILENAME_MAP[file_hash] = file.filename
    
    # Check if file already exists
    file_path = UPLOAD_DIR / f"{file_hash}.pdf"
    if file_path.exists():
        print(f"Document already exists: {file_hash}")
        return {"doc_id": file_hash, "filename": file.filename, "url": f"/uploads/{file_hash}.pdf", "message": "Document already exists"}
    
    # Save file with hash as filename
    with open(file_path, "wb") as f:
        f.write(content)
    print(f"Saved file to: {file_path}")
    
    return {"doc_id": file_hash, "filename": file.filename, "url": f"/uploads/{file_hash}.pdf"}

# Store original filenames with their hashes
FILENAME_MAP = {}

@app.get("/documents")
def get_documents():
    # List all PDF files in the uploads directory
    files = []
    for file_path in UPLOAD_DIR.glob("*.pdf"):
        doc_id = file_path.stem
        # Use original filename if available, otherwise use hash
        display_name = FILENAME_MAP.get(doc_id, f"{doc_id[:8]}.pdf")
        files.append({
            "doc_id": doc_id,
            "filename": display_name,
            "url": f"/uploads/{doc_id}.pdf"
        })
    return files

# End of file