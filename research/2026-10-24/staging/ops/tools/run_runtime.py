# VP staging launcher: the product runtime (python -m vpvoice) with the Vertex pacer installed first, then (2026-10-24)
# the passive probes (tools/probes.py: measurement only, every wrapper returns the original's result unchanged).
import os, runpy, sys
sys.path.insert(0, os.getcwd())
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import pace  # noqa: F401  (patches aiohttp before the runtime imports its providers)
import probes
probes.install()
runpy.run_module('vpvoice', run_name='__main__', alter_sys=True)
