#!/usr/bin/env python3
# C: sidecar de embeddings semánticos (MiniLM multilingüe, ONNX).
# stdin JSON-lines -> stdout JSON-lines. Sin stdout extra: solo JSON.
#   {"id":1,"op":"ping"} -> {"id":1,"ok":true,"ready":true,"dim":384}
#   {"id":2,"op":"embed","texts":[...]} -> {"id":2,"ok":true,"vecs":[[...]]}
# Uso: python semroute.py --model model.onnx --tokenizer tokenizer.json
import sys
import os
import json
import argparse

MAX_BATCH = 32


def emit(o):
    sys.stdout.write(json.dumps(o, ensure_ascii=False) + '\n')
    sys.stdout.flush()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--model', required=True)
    ap.add_argument('--tokenizer', required=True)
    ap.add_argument('--max-tokens', type=int, default=128)
    args = ap.parse_args()
    for p in (args.model, args.tokenizer):
        if not os.path.exists(p):
            emit({'event': 'fatal', 'error': 'falta: ' + p})
            return 1
    try:
        import numpy as np
        import onnxruntime as ort
        from tokenizers import Tokenizer
    except Exception as e:
        emit({'event': 'fatal', 'error': 'deps: ' + str(e)})
        return 1
    try:
        tok = Tokenizer.from_file(args.tokenizer)
        sess = ort.InferenceSession(args.model, providers=['CPUExecutionProvider'])
    except Exception as e:
        emit({'event': 'fatal', 'error': 'carga: ' + str(e)})
        return 1
    in_names = {i.name for i in sess.get_inputs()}
    want_tid = 'token_type_ids' in in_names
    out_name = sess.get_outputs()[0].name
    dim = None

    def embed_batch(texts):
        nonlocal dim
        texts = [str(t or '')[:2000] for t in texts][:MAX_BATCH]
        if not texts:
            return []
        encs = tok.encode_batch(texts)
        seqs = []
        for e in encs:
            seqs.append(e.ids[:args.max_tokens])
        # Padding FIJO a max_tokens: embeddings deterministas (lote-invariantes).
        blen = args.max_tokens
        n = len(seqs)
        ids = np.zeros((n, blen), dtype=np.int64)
        mask = np.zeros((n, blen), dtype=np.int64)
        for i, s in enumerate(seqs):
            ids[i, :len(s)] = s
            mask[i, :len(s)] = 1
        feed = {'input_ids': ids, 'attention_mask': mask}
        if want_tid:
            feed['token_type_ids'] = np.zeros((n, blen), dtype=np.int64)
        last = np.asarray(sess.run([out_name], feed)[0], dtype=np.float64)
        m = mask[:, :, None].astype(np.float64)
        s = (last * m).sum(axis=1) / np.maximum(m.sum(axis=1), 1e-9)
        nr = np.linalg.norm(s, axis=1, keepdims=True)
        s = s / np.maximum(nr, 1e-9)
        dim = s.shape[1]
        return [[round(float(x), 5) for x in row] for row in s]

    emit({'event': 'ready', 'model': os.path.basename(args.model)})
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            req = json.loads(line)
        except Exception as e:
            emit({'id': None, 'ok': False, 'error': 'json: ' + str(e)})
            continue
        rid = req.get('id')
        try:
            op = req.get('op')
            if op == 'ping':
                emit({'id': rid, 'ok': True, 'ready': True, 'dim': dim})
            elif op == 'embed':
                vecs = embed_batch(req.get('texts') or [])
                emit({'id': rid, 'ok': True, 'dim': dim or 0, 'vecs': vecs})
            else:
                emit({'id': rid, 'ok': False, 'error': 'op?'})
        except Exception as e:
            emit({'id': rid, 'ok': False, 'error': str(e)[:300]})
    return 0


if __name__ == '__main__':
    sys.exit(main())
