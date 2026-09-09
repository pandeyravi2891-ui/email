# Thread or Not — Email Thread Detection

Full-stack app: a Flask backend that serves your fine-tuned DistilBERT model
(`model.safetensors`), and a plain HTML/CSS/JS frontend that talks to it.

```
email-thread-app/
├── backend/
│   ├── app.py              # Flask API + serves the frontend
│   ├── requirements.txt
│   └── model/
│       ├── config.json
│       ├── tokenizer.json
│       ├── tokenizer_config.json
│       └── model.safetensors   # your trained weights
├── frontend/
│   ├── index.html
│   ├── style.css
│   └── script.js
└── README.md
```

## Important — please read

This package now uses your **complete model export** (config + tokenizer +
weights together), loaded fully from local disk via `AutoTokenizer` /
`AutoModelForSequenceClassification`. **No internet connection is needed to
run it** — everything it needs is already inside `backend/model/`.

Architecture confirmed from your files: DistilBERT (6 layers, hidden 768)
with a `pre_classifier` + `classifier` head, 2 output classes.

One thing to verify once it's running:

- **Label order** — `app.py` assumes `0 = NEW_EMAIL`, `1 = THREAD_REPLY`.
  If your training used the opposite order, flip the `LABELS` dict near the
  top of `backend/app.py`.

## Setup

```bash
cd backend
python -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate
pip install -r requirements.txt
python app.py
```

The server starts on `http://localhost:5000` and serves the frontend directly
— just open that URL in your browser. No separate frontend server needed.

## API

**POST** `/api/predict`

```json
{
  "subject": "Re: Budget review",
  "body": "Thanks for sending this over...",
  "headers": {
    "In-Reply-To": "<abc123@mail.example.com>",
    "References": "<abc123@mail.example.com>"
  }
}
```

Response:

```json
{
  "model_prediction": "THREAD_REPLY",
  "model_confidence": 0.93,
  "probabilities": { "NEW_EMAIL": 0.07, "THREAD_REPLY": 0.93 },
  "structural_signals": {
    "has_re_fwd_subject": true,
    "has_in_reply_to": true,
    "has_references": true
  },
  "final_prediction": "THREAD_REPLY"
}
```

`final_prediction` fuses the model's text-only call with header evidence
(`In-Reply-To` / `References` are near-ground-truth signals in real email,
so they override a weak model call). `headers` is optional — the model
still runs on subject + body alone if you don't have them.

**GET** `/api/health` — quick check that the model file loaded.

## Notes on accuracy

A text-only classifier will sometimes be genuinely ambiguous (e.g. a
one-line reply with no quoted text). In production, prefer feeding the
real `In-Reply-To`/`References` headers whenever you have them — they're
far more reliable than the model alone, which is why the backend fuses
both.
