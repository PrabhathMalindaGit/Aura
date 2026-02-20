# Aura AI Service (Safety Router)

## 1) Start from repo root
```bash
cd "/Users/University/Final Project/aura"
```

## 2) Create & activate venv
```bash
cd ai
python3 -m venv .venv
source .venv/bin/activate
```

## 3) Install dependencies
```bash
pip install -r requirements.txt
```

## 4) Run the server
```bash
uvicorn src.main:app --reload --host 127.0.0.1 --port 8001
```

## 5) Verify health
```bash
curl -s http://localhost:8001/health
```

## 6) Test classify (pain high)
```bash
curl -X POST http://localhost:8001/classify \
  -H "Content-Type: application/json" \
  -d '{"type":"checkin","pain":8,"text":"pain getting worse"}'
```

## 7) Test classify (crisis keyword)
```bash
curl -X POST http://localhost:8001/classify \
  -H "Content-Type: application/json" \
  -d '{"type":"chat","text":"I cant breathe"}'
```

## 8) Expected outputs
- health returns `{"status":"ok"}`
- checkin pain>=7 returns `{"risk":"high","reasons":["PAIN_GE_THRESHOLD"],"ruleVersion":"v1"}`
- crisis phrase returns `{"risk":"high","reasons":["CRISIS_LANGUAGE"],"ruleVersion":"v1"}`

## 9) Troubleshooting
- If port 8001 in use: `lsof -i :8001`
- If venv activation fails: ensure you are using bash/zsh
- If import errors: confirm folder names match and run from ai/ directory
