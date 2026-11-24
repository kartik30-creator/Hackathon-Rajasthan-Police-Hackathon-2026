# TRACEPOINT AI — OSINT Illegal-Trade Triage

A runnable, local-first web demonstrator for the PS02 problem statement. It imports public-source post datasets, classifies potentially suspicious advertisements, extracts public text indicators, highlights repeated identifiers and supports human review.

> **Important:** This is an investigative triage prototype, not an automated law-enforcement decision system. Model labels and risk levels are leads only. A repeated phone number, handle or payment identifier does not establish identity, ownership, coordination or guilt. Do not use this system to target individuals, publish allegations, or take enforcement action without independent lawful verification.

## Features

- Dark responsive intelligence dashboard.
- Seeded sample dataset with synthetic demonstration posts.
- CSV and JSON upload (`text` is the required content field; `message` and `caption` are accepted alternatives).
- Hybrid classifier: TF-IDF + Logistic Regression trained on a small curated starter set, with transparent slang/emoji keyword signals.
- Entity extraction for phone-like strings, UPI-like IDs, Telegram handles and common wallet address formats.
- Repeated-indicator co-occurrence graph.
- Manual post analysis, risk triage, review status workflow and JSON evidence export.
- FastAPI backend; all demo data is stored in memory and resets on restart.

## Requirements

- Python 3.10–3.12 recommended.
- Internet access for the first `pip install` only.
- Windows, macOS or Linux.

## Windows quick start

1. Extract the ZIP. (https://drive.google.com/drive/folders/1e5NXnHUlbNPQH5cwxn033vzbFq24Rkei?dmr=1&ec=wgc-drive-%5Bmodule%5D-goto)
2. Open the `TRACEPOINT_AI` folder.
3. Double-click `start.bat`.
4. Wait for the server to start, then open http://127.0.0.1:8000

If Windows blocks the script, open Command Prompt in this folder and run:

```bat
py -3.11 -m venv .venv
.venv\Scripts\activate
python -m pip install --upgrade pip
pip install -r requirements.txt
python -m uvicorn backend.main:app --host 127.0.0.1 --port 8000
```

## macOS / Linux

```bash
python3 -m venv .venv
source .venv/bin/activate
python -m pip install --upgrade pip
pip install -r requirements.txt
python -m uvicorn backend.main:app --host 127.0.0.1 --port 8000
```

Open http://127.0.0.1:8000. Stop with Ctrl+C.

## Dataset format

CSV example:

```csv
id,source,timestamp,text,url
demo-01,public_channel,2026-11-24T10:00:00Z,"Example public post text",https://t.me/example/1
```

JSON example:

```json
{
  "posts": [
    {
      "id": "demo-01",
      "source": "public_channel",
      "timestamp": "2026-11-24T10:00:00Z",
      "text": "Example public post text",
      "url": "https://t.me/example/1"
    }
  ]
}
```

Uploads are added to the in-memory dataset. Restarting the server restores the bundled sample dataset. Export the evidence JSON before stopping if you need to preserve demo results.

## API endpoints

- `GET /api/health` — server health
- `GET /api/summary` — dashboard counts
- `GET /api/posts` — records; optional `category`, `risk`, `q` filters
- `POST /api/analyse` — JSON body `{ "text": "..." }`
- `POST /api/upload` — multipart CSV or JSON file
- `PATCH /api/posts/{id}/review` — JSON body `{ "status": "Under Review", "note": "" }`
- `GET /api/graph` — repeated-identifier graph
- `GET /api/export` — JSON export

## Classifier limitations

The included model is deliberately a baseline, trained on a small synthetic seed set so the prototype runs without downloading a model. It is not production-grade, not validated on real-world language, and may misclassify sarcasm, news reporting, jokes, legitimate services or obfuscated language. Confidence is not a calibrated probability. The lexicon is illustrative and will need careful domain-expert review, multilingual testing, representative labeled data, precision/recall evaluation and bias testing before any operational use.

## Telegram integration status

The current runnable version supports Telegram/public-platform data through CSV/JSON import. It intentionally does **not** silently scrape Telegram. A live collector requires authorized API credentials, an approved list of public channels, platform-policy review, rate limiting, source logging and privacy safeguards. Do not monitor private groups, bypass access controls, or collect more personal data than necessary.

## Suggested next steps

1. Create a legally reviewed, representative, labeled dataset.
2. Evaluate per-category precision, recall, F1 and false-positive rates.
3. Add multilingual normalization and reviewed slang dictionaries.
4. Add role-based access, encryption at rest, retention limits and audit logging.
5. Integrate an authorized public-source collector with rate limits and a source allowlist.
6. Add image OCR only where lawful and with a human verification step.
