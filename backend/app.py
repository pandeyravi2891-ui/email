"""
Email Thread Detection - Backend (Flask)
-----------------------------------------
Serves:
  - Static frontend (index.html / script.js / style.css)
  - POST /api/predict   -> classify a single email
  - GET  /api/health    -> health check

Model: fine-tuned DistilBERT (model.safetensors) + custom Linear(768,2) head.
"""

import os
import re

import torch
from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
from transformers import AutoTokenizer, AutoModelForSequenceClassification

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
MODEL_DIR = os.path.join(BASE_DIR, "model")  # contains config.json, tokenizer files, model.safetensors
LABELS = {0: "NEW_EMAIL", 1: "THREAD_REPLY"}  # flip if your training used the opposite order
MAX_LEN = 256

FRONTEND_DIR = os.path.join(os.path.dirname(BASE_DIR), "frontend")

app = Flask(__name__, static_folder=FRONTEND_DIR, static_url_path="")
CORS(app)


# ---------------------------------------------------------------------------
# Structural & Body signals - fused with the model's prediction
# ---------------------------------------------------------------------------
REPLY_SUBJECT_RE = re.compile(r"^\s*(re|fw|fwd|aw|sv|r)\s*:\s*", re.IGNORECASE)
ORIGINAL_MSG_RE = re.compile(r"(-{3,}\s*Original Message\s*-{3,}|_{10,}|From:\s*.*?\nSent:\s*.*?\nTo:\s*.*?\nSubject:)", re.IGNORECASE)
ON_WROTE_RE = re.compile(r"(\n|^)(On\s+.+?\s+wrote:|\bAt\s+.+?,\s+.+?\s+wrote:)", re.IGNORECASE)
BLOCKQUOTE_RE = re.compile(r"(^|\n)>\s*.*", re.MULTILINE)

CONVERSATIONAL_REPLY_CUES = [
    r"\bthanks for (getting back|the update|the follow.?up|following up|reaching out|clarifying|the info)\b",
    r"\bas discussed (earlier|previously|yesterday|on the call|in our meeting)\b",
    r"\bin response to your\b",
    r"\bfollowing up on (our|your|the)\b",
    r"\bsounds good to me\b",
    r"\bper our (conversation|discussion|call)\b",
    r"\bsee inline comments\b",
    r"\bi agree with your\b",
]
CONVERSATIONAL_RE = re.compile("|".join(CONVERSATIONAL_REPLY_CUES), re.IGNORECASE)


def normalize_subject(subject):
    """Strip Re:, Fwd:, etc. to get the core topic thread name."""
    s = subject or "No Subject"
    return REPLY_SUBJECT_RE.sub("", s).strip()


def extract_thread_signals(subject, body, headers):
    headers = headers or {}
    subject_str = subject or ""
    body_str = body or ""

    has_re_fwd = bool(REPLY_SUBJECT_RE.match(subject_str))
    has_in_reply_to = bool(headers.get("In-Reply-To") or headers.get("in_reply_to"))
    has_references = bool(headers.get("References") or headers.get("references"))

    has_orig_hdr = bool(ORIGINAL_MSG_RE.search(body_str))
    has_on_wrote = bool(ON_WROTE_RE.search(body_str))
    has_blockquotes = bool(BLOCKQUOTE_RE.search(body_str))
    has_quoted_history = has_orig_hdr or has_on_wrote or has_blockquotes

    has_conv_cues = bool(CONVERSATIONAL_RE.search(body_str))

    # Try extracting previous quoted snippets if present
    quoted_snippet = ""
    clean_body = body_str
    if has_orig_hdr:
        parts = ORIGINAL_MSG_RE.split(body_str, maxsplit=1)
        if len(parts) > 1:
            clean_body = parts[0].strip()
            quoted_snippet = parts[1].strip()[:300]
    elif has_on_wrote:
        parts = ON_WROTE_RE.split(body_str, maxsplit=1)
        if len(parts) > 1:
            clean_body = parts[0].strip()
            quoted_snippet = parts[-1].strip()[:300]

    return {
        "has_re_fwd_subject": has_re_fwd,
        "has_in_reply_to": has_in_reply_to,
        "has_references": has_references,
        "has_quoted_history": has_quoted_history,
        "has_conversational_cues": has_conv_cues,
        "normalized_subject": normalize_subject(subject_str),
        "quoted_snippet": quoted_snippet,
        "clean_body_length": len(clean_body),
    }


def fuse_prediction(model_label, model_confidence, sig):
    reasons = []
    is_thread = False

    # 1. Structural headers are conclusive RFC proof
    if sig["has_in_reply_to"]:
        reasons.append("RFC In-Reply-To header detected (Direct reply link to message ID)")
        is_thread = True
    if sig["has_references"]:
        reasons.append("RFC References header detected (Tied to earlier thread chain)")
        is_thread = True

    # 2. Subject line reply/fwd prefix
    if sig["has_re_fwd_subject"]:
        reasons.append('Subject begins with reply prefix ("Re:" / "Fwd:")')
        is_thread = True

    # 3. Quoted email conversation history in body
    if sig["has_quoted_history"]:
        reasons.append("Quoted message history / previous email quote block detected in body")
        is_thread = True

    # 4. Model prediction fusion
    if model_label == "THREAD_REPLY":
        if model_confidence >= 0.55:
            reasons.append(f"DistilBERT AI classified text style as thread reply ({round(model_confidence * 100, 1)}% confidence)")
            is_thread = True
    else:
        if not is_thread:
            reasons.append(f"DistilBERT AI classified text as new standalone email ({round(model_confidence * 100, 1)}% confidence)")

    if sig["has_conversational_cues"] and is_thread:
        reasons.append("Conversational follow-up cues detected in message text")

    if not is_thread:
        reasons.append("No header references, reply prefixes, quoted lines, or conversational reply patterns found")

    final_label = "THREAD_REPLY" if is_thread else "NEW_EMAIL"
    return final_label, is_thread, reasons


# ---------------------------------------------------------------------------
# Load model + tokenizer once at startup
# ---------------------------------------------------------------------------
print("Loading tokenizer + model from", MODEL_DIR, "(fully local, no internet needed)")
tokenizer = AutoTokenizer.from_pretrained(MODEL_DIR)
model = AutoModelForSequenceClassification.from_pretrained(MODEL_DIR)
model.eval()
print("Model ready.")


def predict(subject, body, headers=None):
    text = f"{subject or ''} [SEP] {body or ''}"
    enc = tokenizer(
        text,
        truncation=True,
        padding="max_length",
        max_length=MAX_LEN,
        return_tensors="pt",
    )
    with torch.no_grad():
        logits = model(**enc).logits
        probs = torch.softmax(logits, dim=-1)[0]
        pred_id = int(torch.argmax(probs))

    model_label = LABELS[pred_id]
    model_confidence = float(probs[pred_id])
    sig = extract_thread_signals(subject, body, headers)
    final_label, is_thread, reasons = fuse_prediction(model_label, model_confidence, sig)

    # Compute overall confidence score
    effective_confidence = model_confidence
    if sig["has_in_reply_to"] or sig["has_references"] or sig["has_quoted_history"]:
        effective_confidence = max(model_confidence, 0.985)

    return {
        "is_thread": is_thread,
        "final_prediction": final_label,
        "model_prediction": model_label,
        "model_confidence": round(model_confidence, 4),
        "confidence_score": round(effective_confidence, 4),
        "probabilities": {LABELS[i]: round(float(p), 4) for i, p in enumerate(probs)},
        "structural_signals": sig,
        "detection_reasons": reasons,
    }


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------
@app.route("/api/health", methods=["GET"])
def health():
    return jsonify({
        "status": "ok",
        "model_loaded": os.path.exists(os.path.join(MODEL_DIR, "model.safetensors")),
        "app_name": "ThreadPulse AI",
        "version": "2.0.0"
    })


@app.route("/api/predict", methods=["POST"])
def api_predict():
    data = request.get_json(force=True, silent=True) or {}
    subject = data.get("subject", "")
    body = data.get("body", "")
    headers = data.get("headers", {})

    if not subject and not body:
        return jsonify({"error": "Provide at least 'subject' or 'body'."}), 400

    try:
        result = predict(subject, body, headers)
        return jsonify(result)
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/batch-predict", methods=["POST"])
def api_batch_predict():
    data = request.get_json(force=True, silent=True) or {}
    emails = data.get("emails", [])

    if not isinstance(emails, list) or not emails:
        return jsonify({"error": "Provide a non-empty array of emails."}), 400

    results = []
    threads_map = {}

    for i, item in enumerate(emails):
        subj = item.get("subject", "")
        body = item.get("body", "")
        headers = item.get("headers", {})
        item_id = item.get("id", f"msg-{i+1}")

        res = predict(subj, body, headers)
        res["id"] = item_id
        res["subject"] = subj
        res["sender"] = item.get("sender", "Unknown")
        results.append(res)

        # Cluster by thread
        norm_subj = res["structural_signals"]["normalized_subject"].lower()
        if norm_subj not in threads_map:
            threads_map[norm_subj] = []
        threads_map[norm_subj].append(item_id)

    total = len(results)
    thread_count = sum(1 for r in results if r["is_thread"])

    return jsonify({
        "total_analyzed": total,
        "threads_detected": thread_count,
        "standalone_emails": total - thread_count,
        "emails": results,
        "thread_clusters": [
            {"topic": topic, "message_ids": msg_ids, "is_thread": len(msg_ids) > 1}
            for topic, msg_ids in threads_map.items()
        ]
    })


@app.route("/")
def serve_frontend():
    return send_from_directory(app.static_folder, "index.html")


@app.route("/<path:path>")
def serve_static(path):
    return send_from_directory(app.static_folder, path)


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port, debug=True)
