"""Decode copied journal files into immutable NDJSON; originals remain unchanged."""
import sys,json,argparse
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'firmware'))
from storage import read
p=argparse.ArgumentParser();p.add_argument('journal');p.add_argument('output');a=p.parse_args()
with open(a.output,'x') as f:
    for path in sorted(Path(a.journal).glob('*.rec')):
        record=read(str(path));f.write(json.dumps(record)+'\n')
print('Export complete. Verify count before any technician-authorized purge.')
