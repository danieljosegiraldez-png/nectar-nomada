"""Local configuration only in V1. Remote firmware execution/config writes disabled."""
import json
from calibration import finite
DEFAULTS={'sample_seconds':3600,'cloud_enabled':False,'product':'',
          'host_poweroff':False,'audio_enabled':True,'battery_gain':2.0,
          'adc_reference_mv':3300,'battery_warn_mv':3500,'battery_stop_mv':3300,
          'max_queue_per_wake':8,'hardware':'V1-P1','firmware':'1.0.0-rc1'}

def validate(value):
    allowed=set(DEFAULTS)|{'epoch','calibration','configuration_id'}
    if set(value)-allowed: raise ValueError('CONFIG_UNKNOWN_KEY')
    c=dict(DEFAULTS); c.update(value)
    for k in ('cloud_enabled','host_poweroff','audio_enabled'):
        if type(c[k]) is not bool: raise ValueError('CONFIG_BOOL:'+k)
    for k,lo,hi in [('sample_seconds',300,86400),('max_queue_per_wake',1,16),
                    ('battery_warn_mv',3300,4100),('battery_stop_mv',3100,3600),
                    ('adc_reference_mv',3100,3500)]:
        if type(c[k]) is not int or not lo<=c[k]<=hi: raise ValueError('CONFIG_RANGE:'+k)
    if not finite(c['battery_gain']) or not 1.8<=c['battery_gain']<=2.2:
        raise ValueError('CONFIG_ADC_GAIN')
    if c['battery_stop_mv']>=c['battery_warn_mv']: raise ValueError('CONFIG_BATTERY_THRESHOLDS')
    epoch=c.get('epoch','')
    if len(epoch)!=32 or any(ch not in '0123456789abcdef' for ch in epoch):
        raise ValueError('COMMISSIONING_EPOCH_REQUIRED')
    if c['cloud_enabled'] and not c['product']: raise ValueError('PRODUCT_REQUIRED')
    if not isinstance(c['product'],str) or len(c['product'])>160: raise ValueError('PRODUCT_INVALID')
    cal=c.get('calibration')
    if cal is not None:
        if not isinstance(cal,dict) or set(cal)-{'id','offset','counts_per_kg','residual_kg'}:
            raise ValueError('CAL_INVALID')
        if not isinstance(cal.get('id'),str) or not cal['id'] or len(cal['id'])>64:
            raise ValueError('CAL_ID')
        if not finite(cal.get('offset')) or not finite(cal.get('counts_per_kg')) or abs(cal['counts_per_kg'])<1:
            raise ValueError('CAL_INVALID')
    c.setdefault('calibration',None)
    c.setdefault('configuration_id','local-1')
    for k in ('hardware','firmware','configuration_id'):
        if not isinstance(c[k],str) or not 1<=len(c[k])<=64: raise ValueError('CONFIG_STRING')
    return c

def load(path='config.json'):
    with open(path) as f: return validate(json.load(f))
