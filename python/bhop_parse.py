#!/usr/bin/env python3
"""Turn cells_vote.json into parts.json (parts + heading list). Usage: python bhop_parse.py <work_dir>"""
import collections, json, os, re, sys

WORK = sys.argv[1]
cells = json.load(open(os.path.join(WORK, "cells_vote.json"), encoding="utf-8"))
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from bhop_vehicles_spec import SPEC
CELL_TABLE = json.load(open(os.path.join(WORK, "cell_table.json")))
def label(k):
    p, sd, t = k.split("|")
    return f"{p}{'LR'[int(sd)]}{'' if t == '162' else '@' + t}"
STOP = {"for", "with", "without", "hole", "left", "right"}
def name_key(n):
    n = re.sub(r"w\s*[/\-.]\s*o|with\s*hole|hole", " ", n.lower())
    toks = [t for t in re.findall(r"[a-z]{3,}", n) if t not in STOP]
    return tuple(toks[:2])
SEP = r"\s*[-_—–.]\s*"
CODE4 = re.compile(r"B[HN]" + SEP + r"([A-Z][A-Z0-9]{1,2})" + SEP + r"([0-9O]{2})" + SEP + r"([0-9O]{2})(?![0-9])")   # Lexus: BH-ES-06-01
CODE3 = re.compile(r"B[HN]" + SEP + r"([A-Z][A-Z0-9]{1,2})" + SEP + r"([0-9O]{3,4})([A-Z]{0,3})(?![0-9])")        # BH-TY-539, BH-MZ-092GV
class _C:
    @staticmethod
    def search(l):
        m = CODE4.search(l)
        if m:
            return _M(m.group(1), (m.group(2) + "-" + m.group(3)).replace("O", "0"))
        m = CODE3.search(l)
        if m:
            return _M(m.group(1), m.group(2).replace("O", "0") + m.group(3))
        return None
class _M:
    def __init__(self, a, b): self.a, self.b = a.replace("1", "I").replace("0", "O"), b
    def group(self, i): return self.a if i == 1 else self.b
CODE = _C
OE_TOKEN = re.compile(r"(?:[LR]\s*[:：]\s*)?[0-9A-Z][0-9A-Z]{2,}(?:[-/][0-9A-Z]+)*")

def clean(s):
    s = re.sub(r"[^\x20-\x7E\n]", "", s)          # drop OCR junk / non-ascii
    return s

def code_of(t):
    m = CODE.search(t)
    return (m.group(1), m.group(2) if "-" in m.group(2) else m.group(2).zfill(3)) if m else None

def split(text):
    """-> (name_lines, code, oe_lines)"""
    lines = [l.strip() for l in clean(text).split("\n") if l.strip()]
    for i, l in enumerate(lines):
        m = CODE.search(l)
        if m:
            return lines[:i], (m.group(1), m.group(2) if "-" in m.group(2) else m.group(2).zfill(3)), lines[i + 1:]
    return lines, None, []

def norm(s):
    return re.sub(r"[^a-z0-9]", "", s.lower())

def vote(values):
    c = collections.Counter(v for v in values if v)
    return c.most_common(1)[0][0] if c else None

parts = {}
order = []
for ci, c in enumerate(cells):
    texts = c["vote_text"] + [c["text"]]
    codes = collections.Counter()
    for t in texts:
        k = code_of(t)
        if k:
            codes[k] += 1
    if not codes:
        continue
    (pre, num), n = codes.most_common(1)[0]
    spec = SPEC[label(CELL_TABLE[str(ci)])]
    opre = pre
    cat_code = f"BH-{pre}-{num}"                      # code as printed in the catalogue
    if spec[0] == "NISSAN" and pre in ("NI", "N1"):
        pre = "NS"                                      # Nissan tables: avoid clashing with the Lexus 'NI' codes
    sku = f"BOH-{pre}-{num}"
    # name: vote on joined name lines
    names = []
    for t in texts:
        nl, k, _ = split(t)
        if k == (opre, num) and nl:
            names.append(" ".join(nl))
    nname = collections.Counter(norm(x) for x in names)
    best_norm = nname.most_common(1)[0][0] if nname else ""
    name = next((x for x in names if norm(x) == best_norm), "")
    name = re.sub(r"\s+", " ", name).strip()
    # OE tokens: keep tokens seen in >=2 passes (fallback: all tokens of best single pass)
    tok_sets = []
    for t in texts:
        nl, k, oel = split(t)
        if k == (opre, num):
            toks = []
            for l in oel:
                l = re.sub(r"\s*[:：]\s*", ":", l)
                toks += [x.strip() for x in re.split(r"\s+", l) if len(re.sub(r"\W", "", x)) >= 5]
            tok_sets.append(toks)
    cnt = collections.Counter(tok for ts in tok_sets for tok in set(ts))
    oe_tokens = [tok for tok, k in cnt.most_common() if k >= 2]
    # keep order of first appearance in the longest list
    ref = max(tok_sets, key=len) if tok_sets else []
    oe = [tok for tok in ref if tok in oe_tokens]
    for tok in oe_tokens:
        if tok not in oe:
            oe.append(tok)
    if not oe and ref:                       # single-vote fallback (e.g. a number only one OCR pass could read)
        oe = [t for t in ref if re.search(r"\d{4,}", t)]
        for t in oe:
            cnt[t] = cnt.get(t, 1)
    conf = codes.most_common(1)[0][1]
    oe_min = min((cnt[t] for t in oe), default=0)
    oe_cnt = [cnt[t] for t in oe]
    base_sku = sku
    suffix = ""
    while sku in parts and name_key(parts[sku]["name"]) != name_key(name) and name_key(name):
        suffix = chr(ord(suffix or "A") + 1) if suffix else "B"
        sku = f"{base_sku}-{suffix}"
    rec = parts.get(sku)
    entry = {"i": ci, "heading": c["heading"], "page": c["page"], "rect": c["rect"], "photo": c["photo"]}
    if rec is None:
        parts[sku] = {"sku": sku, "cat_code": cat_code, "prefix": pre, "name": name, "oe": oe, "conf": conf, "oe_min": oe_min, "oe_cnt": oe_cnt,
                      "entries": [entry], "make_tab": c["make_tab"]}
        order.append(sku)
    else:
        rec["entries"].append(entry)
        if not rec["name"] and name:
            rec["name"] = name
        if not rec["oe"] and oe:
            rec["oe"] = oe
json.dump([parts[s] for s in order], open(os.path.join(WORK, "parts.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
print(len(order), "unique SKUs")
