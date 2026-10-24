# VP staging launcher: the product runtime (python -m vpvoice) with the Vertex pacer installed first.
import os, runpy, sys
sys.path.insert(0, os.getcwd())
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import pace  # noqa: F401  (patches aiohttp before the runtime imports its providers)
runpy.run_module('vpvoice', run_name='__main__', alter_sys=True)
