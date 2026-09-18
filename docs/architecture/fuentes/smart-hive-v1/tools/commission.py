"""Generate a unique, offline-first config on a desktop; never overwrite an epoch."""
import argparse,json,uuid
from pathlib import Path
p=argparse.ArgumentParser()
p.add_argument('--output',required=True)
p.add_argument('--product',default='')
p.add_argument('--poweroff',action='store_true')
a=p.parse_args()
value={'epoch':uuid.uuid4().hex,'cloud_enabled':bool(a.product),'product':a.product,
       'host_poweroff':a.poweroff,'configuration_id':'commission-1','calibration':None}
with open(a.output,'x') as f: json.dump(value,f,indent=2)
print('Created',a.output,'; retain a backup with the physical device record.')
