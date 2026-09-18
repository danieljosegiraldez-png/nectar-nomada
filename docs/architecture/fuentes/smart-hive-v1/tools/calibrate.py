"""Fit raw counts vs certified kg; update a copied config, never auto-tare a hive."""
import sys,json,argparse
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'firmware'))
from calibration import fit
from config import validate
p=argparse.ArgumentParser()
p.add_argument('--config',required=True);p.add_argument('--points',required=True)
p.add_argument('--id',required=True);p.add_argument('--output',required=True)
a=p.parse_args()
with open(a.config) as f: cfg=json.load(f)
with open(a.points) as f: points=json.load(f)
cfg['calibration']=fit(points,a.id)
validate(cfg)
with open(a.output,'x') as f: json.dump(cfg,f,indent=2)
print(json.dumps(cfg['calibration'],indent=2))
