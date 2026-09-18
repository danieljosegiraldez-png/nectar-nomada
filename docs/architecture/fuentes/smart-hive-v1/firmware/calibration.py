"""Robust within-window scale estimate; no cross-window smoothing of real changes."""
import math

def finite(x): return isinstance(x,(int,float)) and not isinstance(x,bool) and math.isfinite(x)
def median(values):
    v=sorted(values)
    if not v: raise ValueError('EMPTY')
    n=len(v)
    return v[n//2] if n%2 else (v[n//2-1]+v[n//2])/2

def fit(points, calibration_id):
    if len(points)<3: raise ValueError('NEED_3_CAL_POINTS')
    xs=[p[0] for p in points]; ys=[p[1] for p in points]
    if not all(finite(v) for v in xs+ys) or min(xs)<0 or max(xs)>120:
        raise ValueError('CAL_RANGE')
    if max(xs)-min(xs)<20: raise ValueError('CAL_SPAN')
    xm=sum(xs)/len(xs); ym=sum(ys)/len(ys)
    slope=sum((x-xm)*(y-ym) for x,y in points)/sum((x-xm)**2 for x in xs)
    if abs(slope)<1: raise ValueError('CAL_SCALE')
    offset=ym-slope*xm
    residual=max(abs((y-offset)/slope-x) for x,y in points)
    if residual>0.2: raise ValueError('CAL_RESIDUAL')
    return {'id':calibration_id,'offset':offset,'counts_per_kg':slope,
            'residual_kg':residual}

def weight(samples, cal):
    if len(samples)<9: raise ValueError('WEIGHT_SAMPLES')
    mid=median(samples); mad=median([abs(x-mid) for x in samples])
    keep=[x for x in samples if abs(x-mid)<=max(3*mad,2)]
    if len(keep)<len(samples)*0.6: raise ValueError('WEIGHT_UNSTABLE')
    raw=sum(keep)/len(keep)
    result={'raw':samples,'raw_filtered':round(raw,3), 'mad_counts':mad,
            'retained':len(keep), 'kg':None,'lb':None,'calibration_id':None}
    if cal is None: return result
    scale=cal['counts_per_kg']; offset=cal['offset']
    if not finite(scale) or not finite(offset) or abs(scale)<1: raise ValueError('CAL_INVALID')
    kg=(raw-offset)/scale
    result.update(kg=round(kg,3),lb=round(kg*2.2046226218,3),calibration_id=cal['id'])
    result['spread_kg']=round((max(samples)-min(samples))/abs(scale),3)
    return result
