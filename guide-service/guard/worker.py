"""Dedicated CPU-only ONNX inference process. stdout is JSON protocol only."""

import json
import os
import sys
from pathlib import Path

os.environ["CUDA_VISIBLE_DEVICES"] = ""
os.environ["ORT_DISABLE_ALL"] = "1"
import numpy as np
import onnxruntime as ort
from transformers import AutoTokenizer

MODEL = Path(os.getenv("GUIDE_GUARD_MODEL_DIR", Path(__file__).parent / "models/onnx"))
tokenizer = AutoTokenizer.from_pretrained(MODEL, local_files_only=True)
session = ort.InferenceSession(
    str(MODEL / "model.onnx"), providers=["CPUExecutionProvider"], sess_options=ort.SessionOptions()
)
labels = json.loads((MODEL / "config.json").read_text())["id2label"]
positive = [int(k) for k, v in labels.items() if "inject" in v.lower() or "attack" in v.lower()]
if len(positive) != 1:
    raise RuntimeError("unexpected model labels")
for line in sys.stdin:
    try:
        text = json.loads(line)["text"]
        encoded = tokenizer(text, return_tensors="np", truncation=True, max_length=512)
        inputs = {item.name: encoded[item.name].astype(np.int64) for item in session.get_inputs()}
        logits = session.run(None, inputs)[0][0].astype(np.float64)
        weights = np.exp(logits - logits.max())
        result = {"injection": float((weights / weights.sum())[positive[0]])}
    except Exception:
        result = {"error": "inference failed"}
    print(json.dumps(result), flush=True)
