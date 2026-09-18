"""Cold-start sampling with durable outbox and optional Notehub delivery.
RC firmware: see release gates. This is not physically qualified production firmware.
"""
import machine
import binascii
import gc
from compat import ticks_ms,ticks_diff,wait_ms
from storage import Journal,State,sync
from config import load
from board import Board
from hx711 import HX711
from sht31 import SHT31
from bmp390 import BMP390
from bh1750 import BH1750
from adxl345 import ADXL345
from microphone import capture
from calibration import weight
from notecard import Notecard

def safe(result,name,operation):
    try: result['observations'][name]=operation()
    except Exception as exc:
        result['observations'][name]=None
        result['faults'].append(name+':'+str(exc)[:100])

def scale_read(cfg,feed):
    hx=HX711()
    try:
        hx.samples(2,1500,feed)  # discard two settled conversions
        return weight(hx.samples(15,3000,feed),cfg['calibration'])
    finally: hx.close()

def run():
    board=Board()
    if board.service.value()==0:
        board.off()
        print('SERVICE: main disabled; REPL available; release jumper then reset to run')
        return
    wdt=machine.WDT(timeout=8000)
    feed=wdt.feed
    # Conservative error fallback; invalid configuration never enables cellular.
    interval=3600; card=None; poweroff=False
    try:
        cfg=load(); interval=cfg['sample_seconds']; poweroff=cfg['host_poweroff']
        journal=Journal()
        state=State('runtime')
        runtime=dict(state.value)
        runtime['boot']=runtime.get('boot',0)+1
        runtime['failures']=(runtime.get('failures',0)+1) if runtime.get('in_progress') else 0
        runtime['in_progress']=True
        state.save_redundant(runtime)
        # Unique transaction seed persists across power cycles.
        card=Notecard(board.uart,feed,seed=runtime['boot']*1000)
        record={'schema':'nn.hive.observation/1','device_id':'rp2040-'+binascii.hexlify(machine.unique_id()).decode(),
                'epoch':cfg['epoch'],'ts':None,'time_quality':'unknown',
                'boot':runtime['boot'],'uptime_ms':ticks_ms(),
                'hardware':cfg['hardware'],'firmware':cfg['firmware'],
                'configuration_id':cfg['configuration_id'],
                'reset_cause':machine.reset_cause(),'observations':{},'faults':[],
                'events':[],'missed_samples':runtime.get('missed',0)}
        try:
            t=card.request({'req':'card.time'}).get('time')
            if isinstance(t,int) and 1704067200<=t<4102444800:
                record['ts']=t; record['time_quality']='notecard'
            else: record['faults'].append('TIME_UNSYNCED')
        except Exception as exc: record['faults'].append('time:'+str(exc)[:100])
        safe(record,'battery',lambda:board.battery(cfg,feed))
        safe(record,'inspection',lambda:board.inspection(feed))
        battery=record['observations']['battery']
        low=battery is None or battery['mv']<cfg['battery_stop_mv']
        recovery=runtime['failures']>=3
        if recovery: record['faults'].append('REBOOT_RECOVERY_MODE')
        if low: record['faults'].append('BATTERY_CRITICAL_OR_UNKNOWN')
        if not low and not recovery:
            board.sensors_on(feed)
            safe(record,'weight',lambda:scale_read(cfg,feed))
            for name,ch,driver in [('brood',0,SHT31),('ambient',1,SHT31),
                                   ('pressure',2,BMP390),('accel',3,ADXL345),('light',4,BH1750)]:
                safe(record,name,lambda ch=ch,driver=driver:board.branch(ch,lambda bus:driver(bus).read(feed)))
            if cfg['audio_enabled']: safe(record,'audio',lambda:capture(feed))
            else: record['observations']['audio']=None
        for name in ('weight','brood','ambient','pressure','accel','light','audio'):
            record['observations'].setdefault(name,None)
        board.off()
        if battery and battery['mv']<cfg['battery_warn_mv']: record['events'].append('battery_low')
        inspection=record['observations']['inspection']
        if inspection and (inspection['open'] or inspection['latched']): record['events'].append('inspection_possible')
        accel=record['observations']['accel']
        if accel and accel['tilt_deg']>5: record['events'].append('tilt_review')
        scale=record['observations']['weight']
        if scale:
            if scale['kg'] is None: record['faults'].append('WEIGHT_UNCALIBRATED')
            elif scale['kg']>120 or scale['kg']< -2: record['events'].append('weight_range_review')
            if scale.get('spread_kg',0)>0.2: record['faults'].append('WEIGHT_WINDOW_UNSTABLE')
        committed=False
        try:
            journal.append(record); committed=True
            runtime['missed']=0; state.save(runtime)
            board.clear_inspection()
        except Exception as exc:
            runtime['missed']=runtime.get('missed',0)+1
            state.save(runtime)
            print('LOGGING FAULT',str(exc))
        if cfg['cloud_enabled'] and not low and not card.bad:
            try:
                # Persist policy on the Notecard. No forced sync after host reset.
                if runtime.get('product')!=cfg['product'] or runtime.get('mode')!='periodic':
                    card.request({'req':'hub.set','product':cfg['product'],
                                  'mode':'periodic','outbound':1440,'inbound':1440})
                    runtime['product']=cfg['product']; runtime['mode']='periodic'; state.save(runtime)
                for i,(name,payload) in enumerate(journal.pending()):
                    if i>=cfg['max_queue_per_wake']: break
                    feed(); card.enqueue(payload)
                    journal.ack(name)  # after matching no-error response only
            except Exception as exc: print('DELIVERY DEFERRED',str(exc))
        elif (not cfg['cloud_enabled'] or low) and not card.bad:
            # Disable scheduled syncing even after a previously connected deployment.
            try:
                card.request({'req':'hub.set','mode':'off'})
                runtime['mode']='off'; state.save(runtime)
            except Exception as exc: print('CLOUD OFF DEFERRED',str(exc))
        runtime['in_progress']=False
        if recovery: runtime['failures']=0
        state.save(runtime)
        print('CYCLE',record['device_id'],'committed',committed,'faults',record['faults'])
    except Exception as exc:
        print('CYCLE ABORT',repr(exc))
    finally:
        board.off(); sync(); gc.collect(); feed()
        if poweroff and card is not None and not card.bad:
            try:
                card.sleep_host(interval)
                wait_ms(2000,feed)
                print('HOST_POWER_GATE_NOT_OFF: using powered fallback')
            except Exception as exc: print('HOST_SLEEP_FAILED',str(exc))
        # Degraded/bench mode is deliberately powered. Do not call this dormant.
        wait_ms(interval*1000,feed)
        machine.reset()

if __name__=='__main__': run()
