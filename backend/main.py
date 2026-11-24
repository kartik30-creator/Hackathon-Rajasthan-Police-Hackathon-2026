from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from pathlib import Path
from typing import Optional
import pandas as pd
import io, json, uuid, os
from .engine import analyse_many, analyse_record

BASE = Path(__file__).resolve().parent.parent
DATA = BASE / "data" / "sample_posts.csv"

app = FastAPI(title="TRACEPOINT AI", version="1.0.0",
              description="Defensive OSINT triage demo. Model outputs are investigative leads, not findings.")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_credentials=False,
                   allow_methods=["*"], allow_headers=["*"])

records = []
review_log = []

def load_sample():
    global records
    df = pd.read_csv(DATA).fillna("")
    raw = df.to_dict(orient="records")
    records = analyse_many(raw)

load_sample()

class ReviewUpdate(BaseModel):
    status: str
    note: Optional[str] = ""

@app.get("/api/health")
def health():
    return {"status": "ok", "app": "TRACEPOINT AI", "records": len(records)}

@app.get("/api/posts")
def get_posts(category: Optional[str] = None, risk: Optional[str] = None, q: Optional[str] = None):
    out = records
    if category and category != "All":
        out = [r for r in out if r["category"] == category]
    if risk and risk != "All":
        out = [r for r in out if r["risk"] == risk]
    if q:
        term = q.lower()
        out = [r for r in out if term in (r["text"] + " " + r["source"] + " " +
               " ".join(sum(r["entities"].values(), []))).lower()]
    return {"items": out, "total": len(out)}

@app.get("/api/summary")
def summary():
    counts = {}
    for r in records:
        counts[r["category"]] = counts.get(r["category"], 0) + 1
    risks = {k: sum(1 for r in records if r["risk"] == k) for k in ["High", "Medium", "Low"]}
    identifiers = sum(len(v) for r in records for v in r["entities"].values())
    return {"total": len(records), "categories": counts, "risks": risks,
            "identifiers": identifiers, "reviewed": sum(r["status"] != "Unreviewed" for r in records)}

@app.post("/api/analyse")
def analyse_text(payload: dict):
    text = str(payload.get("text", "")).strip()
    if not text:
        raise HTTPException(400, "Text is required")
    item = analyse_record({"id": "manual-" + uuid.uuid4().hex[:8], "source": "Manual analysis",
                           "text": text, "timestamp": pd.Timestamp.utcnow().isoformat()})
    records.insert(0, item)
    return item

@app.post("/api/upload")
async def upload(file: UploadFile = File(...)):
    name = (file.filename or "").lower()
    content = await file.read()
    try:
        if name.endswith(".csv"):
            df = pd.read_csv(io.BytesIO(content)).fillna("")
            raw = df.to_dict(orient="records")
        elif name.endswith(".json"):
            parsed = json.loads(content.decode("utf-8-sig"))
            raw = parsed if isinstance(parsed, list) else parsed.get("posts", [])
        else:
            raise HTTPException(400, "Upload a .csv or .json file")
        normalized = []
        for row in raw:
            row = {str(k).lower(): v for k, v in row.items()}
            normalized.append({
                "id": row.get("id") or "imp-" + uuid.uuid4().hex[:8],
                "source": row.get("source") or row.get("channel") or "Imported dataset",
                "timestamp": row.get("timestamp") or row.get("date") or "",
                "text": row.get("text") or row.get("message") or row.get("caption") or "",
                "url": row.get("url") or row.get("link") or "",
                "status": "Unreviewed"
            })
        analysed = analyse_many(normalized)
        records[0:0] = analysed
        return {"added": len(analysed), "items": analysed[:5]}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(400, f"Could not parse file: {e}")

@app.patch("/api/posts/{post_id}/review")
def update_review(post_id: str, update: ReviewUpdate):
    allowed = ["Unreviewed", "Under Review", "Escalated", "Cleared"]
    if update.status not in allowed:
        raise HTTPException(400, "Invalid review status")
    for r in records:
        if r["id"] == post_id:
            r["status"] = update.status
            review_log.append({"id": post_id, "status": update.status, "note": update.note})
            return {"ok": True, "item": r}
    raise HTTPException(404, "Post not found")

@app.get("/api/graph")
def graph():
    # Nodes represent repeated public identifiers only; no claim of identity or guilt.
    entity_posts = {}
    for r in records:
        for kind, values in r["entities"].items():
            for value in values:
                key = (kind, value)
                entity_posts.setdefault(key, []).append(r["id"])
    nodes, edges = [], []
    for i, ((kind, value), ids) in enumerate(entity_posts.items()):
        if len(ids) < 2:
            continue
        node_id = f"e{i}"
        nodes.append({"id": node_id, "label": value, "kind": kind, "count": len(ids)})
        for pid in ids:
            edges.append({"source": node_id, "target": pid})
    post_nodes = [{"id": r["id"], "label": r["id"], "kind": "post", "count": 1}
                  for r in records if any(e["target"] == r["id"] for e in edges)]
    return {"nodes": nodes + post_nodes, "edges": edges}


class TelegramCollectRequest(BaseModel):
    channel: str
    limit: int = 30

@app.post("/api/telegram/collect")
async def collect_public_telegram(payload: TelegramCollectRequest):
    """Optional collector for explicitly allowlisted public channels only."""
    try:
        from telethon import TelegramClient
        from telethon.sessions import StringSession
    except ImportError:
        raise HTTPException(501, "Telegram dependency is not installed")
    api_id = os.getenv("TELEGRAM_API_ID", "").strip()
    api_hash = os.getenv("TELEGRAM_API_HASH", "").strip()
    session = os.getenv("TELEGRAM_SESSION_STRING", "").strip()
    allowlist = {x.strip().lstrip("@") for x in os.getenv("TELEGRAM_PUBLIC_CHANNELS", "").split(",") if x.strip()}
    channel = payload.channel.strip().lstrip("@")
    if not (api_id and api_hash and session):
        raise HTTPException(400, "Configure TELEGRAM_API_ID, TELEGRAM_API_HASH and TELEGRAM_SESSION_STRING first")
    if channel not in allowlist:
        raise HTTPException(403, "Channel is not in TELEGRAM_PUBLIC_CHANNELS allowlist")
    limit = max(1, min(int(payload.limit), 100))
    client = TelegramClient(StringSession(session), int(api_id), api_hash)
    try:
        await client.connect()
        if not await client.is_user_authorized():
            raise HTTPException(401, "Telegram session is not authorized")
        entity = await client.get_entity(channel)
        if not getattr(entity, "username", None):
            raise HTTPException(400, "Only public username-based channels are supported")
        messages = await client.get_messages(entity, limit=limit)
        added = []
        for msg in reversed(messages):
            body = (msg.message or "").strip()
            if not body:
                continue
            item = analyse_record({
                "id": f"tg-{entity.username}-{msg.id}",
                "source": f"Telegram public channel @{entity.username}",
                "timestamp": msg.date.isoformat() if msg.date else "",
                "text": body,
                "url": f"https://t.me/{entity.username}/{msg.id}",
                "status": "Unreviewed"
            })
            added.append(item)
        records[0:0] = added
        return {"channel": entity.username, "added": len(added), "items": added[:5]}
    finally:
        await client.disconnect()

@app.get("/api/export")
def export():
    return {"items": records, "review_log": review_log}

app.mount("/", StaticFiles(directory=BASE / "frontend", html=True), name="frontend")
