"""Host orchestration tests. Hardware is explicitly faked, not emulated."""
import sys,types,tempfile,os,unittest,json,importlib
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'firmware'))
class StopCycle(BaseException): pass
class Pin:
    IN=0;OUT=1;PULL_UP=2;OPEN_DRAIN=3
    def __init__(self,*a,**k):self.v=k.get('value',0)
    def value(self,v=None):
        if v is not None:self.v=v
        return self.v
    def init(self,*a,**k):self.v=k.get('value',0)
class WDT:
    def __init__(self,**k):pass
    def feed(self):pass
machine=types.ModuleType('machine')
machine.Pin=Pin;machine.WDT=WDT;machine.unique_id=lambda:b'\x01'*8
machine.reset_cause=lambda:1
machine.reset=lambda:(_ for _ in ()).throw(StopCycle())
for n in ('I2S','SoftI2C','ADC','UART'):setattr(machine,n,type(n,(),{}))
rp2=types.ModuleType('rp2');rp2.PIO=types.SimpleNamespace(OUT_LOW=0,SHIFT_LEFT=0)
rp2.asm_pio=lambda **kw:lambda fn:fn
sys.modules.setdefault('machine',machine);sys.modules.setdefault('rp2',rp2)
app=importlib.import_module('main')
from config import validate
from storage import Journal,State

class Board:
    latest=None
    def __init__(self):
        Board.latest=self;self.service=Pin();self.service.v=1;self.uart=None
        self.off_count=0;self.cleared=False;self.powered=False
    def battery(self,cfg,feed):return {'raw_u16':36739,'mv':3700}
    def inspection(self,feed):return {'open':False,'latched':True}
    def sensors_on(self,feed):self.powered=True
    def branch(self,ch,fn):return fn(None)
    def off(self):self.powered=False;self.off_count+=1
    def clear_inspection(self):self.cleared=True
class Sensor:
    def __init__(self,bus):pass
    def read(self,feed):return {'tilt_deg':0}
class Card:
    latest=None;fail=False
    def __init__(self,*a,**k):Card.latest=self;self.bad=False;self.queued=[];self.requests=[]
    def request(self,r):self.requests.append(r);return {'time':1789516800}
    def enqueue(self,r):
        if Card.fail:raise OSError('network unavailable')
        self.queued.append(r)
    def sleep_host(self,seconds):pass
class CycleTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.old=os.getcwd();os.chdir(self.tmp.name)
        Card.fail=False
    def tearDown(self):os.chdir(self.old);self.tmp.cleanup()
    def cycle(self,cloud=False,scale_fail=False,battery_mv=3700):
        cfg=validate({'epoch':'a'*32,'cloud_enabled':cloud,'product':'test-product' if cloud else ''})
        def scale(cfg,feed):
            if scale_fail:raise OSError('HX_TIMEOUT')
            return {'raw':[100]*15,'raw_filtered':100,'mad_counts':0,'retained':15,'kg':None,'lb':None,'calibration_id':None}
        with patch.multiple(app,Board=Board,Notecard=Card,SHT31=Sensor,BMP390=Sensor,BH1750=Sensor,ADXL345=Sensor,
                  load=lambda:cfg,capture=lambda feed:{'rms_fs':0.1},scale_read=scale,wait_ms=lambda *args:None),\
             patch.object(Board,'battery',return_value={'raw_u16':1,'mv':battery_mv}):
            with self.assertRaises(StopCycle):app.run()
    def test_offline_commit_no_enqueue_and_off(self):
        self.cycle();self.assertEqual(len(list(Journal().pending())),1)
        self.assertEqual(Card.latest.queued,[]);self.assertFalse(Board.latest.powered)
        self.assertTrue(Board.latest.cleared)
    def test_failed_sensor_is_null_but_committed(self):
        self.cycle(scale_fail=True);r=list(Journal().pending())[0][1]
        self.assertIsNone(r['observations']['weight']);self.assertTrue(any('HX_TIMEOUT' in x for x in r['faults']))
        self.assertIsNotNone(r['observations']['brood'])
    def test_custody_success_deletes_local(self):
        self.cycle(cloud=True);self.assertEqual(len(Card.latest.queued),1)
        self.assertEqual(list(Journal().pending()),[])
    def test_custody_failure_retains_local(self):
        Card.fail=True;self.cycle(cloud=True);self.assertEqual(len(list(Journal().pending())),1)
    def test_low_battery_skips_sensors_and_disables_sync(self):
        self.cycle(cloud=True,battery_mv=3200);r=list(Journal().pending())[0][1]
        self.assertIsNone(r['observations']['brood'])
        self.assertIn({'req':'hub.set','mode':'off'},Card.latest.requests)
    def test_off_to_on_restores_sync_policy(self):
        self.cycle(cloud=True);self.cycle(cloud=False);self.cycle(cloud=True)
        self.assertTrue(any(q.get('mode')=='periodic' for q in Card.latest.requests))
    def test_three_incomplete_boots_recovery_mode(self):
        State('runtime').save({'in_progress':True,'failures':2,'boot':5})
        self.cycle();r=list(Journal().pending())[0][1]
        self.assertIn('REBOOT_RECOVERY_MODE',r['faults'])
        self.assertIsNone(r['observations']['audio'])
    def test_log_failure_does_not_clear_inspection(self):
        with patch('storage.Journal.append',side_effect=OSError('JOURNAL_FULL')):self.cycle()
        self.assertFalse(Board.latest.cleared);self.assertEqual(State('runtime').value['missed'],1)
if __name__=='__main__':unittest.main()
