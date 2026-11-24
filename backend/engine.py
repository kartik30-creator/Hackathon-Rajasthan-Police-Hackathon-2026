import re
from collections import Counter
from typing import Dict, List
import pandas as pd
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.pipeline import Pipeline

CATEGORIES = ["Drugs", "Arms", "Fake Documents", "Financial Fraud", "Other"]

# Curated starter vocabulary. These are signals, not proof of criminal activity.
LEXICON = {
    "Drugs": ["mdma", "cocaine", "heroin", "weed", "hash", "pills", "powder", "stash", "delivery", "🍃", "💊"],
    "Arms": ["gun", "pistol", "rifle", "ammo", "ammunition", "weapon", "firearm"],
    "Fake Documents": ["fake id", "forged", "passport", "driving licence", "documents", "id card", "certificate"],
    "Financial Fraud": ["bank account", "account for rent", "mule account", "upi", "atm card", "debit card",
                        "credit card", "sim card", "net banking", "wallet", "commission", "account available"]
}

SEED = [
    ("Premium account access available for monthly rent. Contact @seller_alpha", "Financial Fraud"),
    ("Need bank accounts for receiving transfers. Commission paid. DM @fin_offer", "Financial Fraud"),
    ("ATM and debit cards available, delivery details in DM", "Financial Fraud"),
    ("Fresh SIM cards and account kits available for rent", "Financial Fraud"),
    ("UPI collection account required, payment per transaction", "Financial Fraud"),
    ("Herbal tea and botanical products, retail catalogue available", "Other"),
    ("Green leaf products and wellness packs, message for details 🍃", "Drugs"),
    ("Party pills and powder available, discreet delivery", "Drugs"),
    ("Cannabis packs available in multiple quantities", "Drugs"),
    ("Pharmaceutical tablets available without prescription", "Drugs"),
    ("Antique sporting rifle listed for licensed collectors only", "Other"),
    ("Unregistered pistol and ammunition available, message seller", "Arms"),
    ("Firearm parts and ammunition offered for sale", "Arms"),
    ("Replica prop weapons for film production", "Other"),
    ("Forged passport and fake ID documents available", "Fake Documents"),
    ("Driving licence and identity card made on request", "Fake Documents"),
    ("Document translation and certified copies service", "Other"),
    ("Looking for graphic designer for ID card templates", "Other"),
    ("Used laptop for sale, pickup near central market", "Other"),
    ("Community event announced for this weekend", "Other"),
    ("Bank account for rent, instant payout, contact @seller_beta", "Financial Fraud"),
    ("Debit cards and net banking kits supplied in bulk", "Financial Fraud"),
    ("Wallet accounts needed for transfer routing", "Financial Fraud"),
    ("Organic gardening seeds and soil supplies", "Other"),
    ("Cocaine and MDMA menu updated, DM for rates", "Drugs"),
    ("Ammunition boxes offered to licensed dealers", "Arms"),
    ("Fake university certificates and transcripts available", "Fake Documents"),
    ("SIM cards with active accounts available for commission", "Financial Fraud"),
]

def build_model():
    texts, labels = zip(*SEED)
    model = Pipeline([
        ("tfidf", TfidfVectorizer(ngram_range=(1, 2), lowercase=True, sublinear_tf=True)),
        ("clf", LogisticRegression(max_iter=1000, class_weight="balanced"))
    ])
    model.fit(texts, labels)
    return model

MODEL = build_model()

PATTERNS = {
    "phone": re.compile(r"(?<!\w)(?:\+?\d[\d\s().-]{7,}\d)(?!\w)"),
    "upi": re.compile(r"(?i)\b[a-z0-9._-]{2,}@[a-z]{2,}\b"),
    "telegram": re.compile(r"(?<!\w)@[A-Za-z0-9_]{4,32}\b"),
    "wallet": re.compile(r"\b(?:0x[a-fA-F0-9]{40}|[13][a-km-zA-HJ-NP-Z1-9]{25,34})\b")
}

def extract_entities(text: str) -> Dict[str, List[str]]:
    result = {}
    for kind, pattern in PATTERNS.items():
        found = list(dict.fromkeys(m.group(0).strip() for m in pattern.finditer(text or "")))
        # Keep phone-like strings conservative; ignore short numeric fragments.
        if kind == "phone":
            found = [x for x in found if sum(ch.isdigit() for ch in x) >= 9]
        result[kind] = found
    return result

def classify(text: str) -> dict:
    text = str(text or "").strip()
    if not text:
        return {"category": "Other", "confidence": 0.0, "risk": "Low", "signals": [], "review_required": True}
    probs = MODEL.predict_proba([text])[0]
    classes = MODEL.named_steps["clf"].classes_
    ranked = sorted(zip(classes, probs), key=lambda x: x[1], reverse=True)
    category, confidence = ranked[0]
    lower = text.lower()
    signals = []
    for cat, terms in LEXICON.items():
        hits = [term for term in terms if term.lower() in lower]
        if hits:
            signals.extend([f"{cat}: {h}" for h in hits[:3]])
    # Combine model confidence and transparent lexical evidence.
    if category != "Other" and signals:
        confidence = min(0.99, float(confidence) + 0.12)
    confidence = float(confidence)
    if category == "Other" or confidence < 0.48:
        risk = "Low"
    elif confidence < 0.72:
        risk = "Medium"
    else:
        risk = "High"
    return {
        "category": category,
        "confidence": round(confidence, 3),
        "risk": risk,
        "signals": signals[:8],
        "review_required": True
    }

def analyse_record(record: dict) -> dict:
    text = str(record.get("text", "") or "")
    result = classify(text)
    entities = extract_entities(text)
    return {
        "id": str(record.get("id") or ""),
        "source": str(record.get("source") or "Imported dataset"),
        "timestamp": str(record.get("timestamp") or ""),
        "text": text,
        "url": str(record.get("url") or ""),
        **result,
        "entities": entities,
        "status": str(record.get("status") or "Unreviewed")
    }

def analyse_many(records: list) -> list:
    return [analyse_record(r) for r in records]
