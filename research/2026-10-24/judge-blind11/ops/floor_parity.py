# Python floor door (product/voice/vpvoice safety.caller_signals) on every line of a crisis set, for the TS/Python
# parity check (floor_parity.mts). Prints JSON: [[list, index, crisis_bool], ...]. No model, no network.
# Usage: python3 -I floor_parity.py TREE SET.json
import json, sys
sys.path.insert(0, sys.argv[1] + '/product/voice')
from vpvoice import safety
S = json.load(open(sys.argv[2]))
print(json.dumps([[lst, i, bool(safety.caller_signals(x['text'])['crisis'])] for lst in ('caller_crisis', 'caller_benign') for i, x in enumerate(S.get(lst, []))]))
