import unittest,tempfile,os,sys,json,math,struct
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'firmware'))
from sht31 import crc8,decode
from calibration import fit,weight
from storage import Journal,State,atomic,read,encode
from config import validate
from bmp390 import compensate
from audio_features import features
import notecard

class SensorTests(unittest.TestCase):
    def test_crc_reference(self): self.assertEqual(crc8(bytes.fromhex('beef')),0x92)
    def test_climate_limits(self):
        b=bytes([0,0,crc8(b'\0\0'),255,255,crc8(b'\xff\xff')])
        self.assertEqual(decode(b)['t_c'],-45);self.assertEqual(decode(b)['rh_pct'],100)
    def test_crc_corruption(self):
        with self.assertRaises(ValueError): decode(b'\0'*6)
    def test_short_read(self):
        with self.assertRaises(ValueError): decode(b'\0')
    def test_scale_fit(self):
        c=fit([(0,100),(20,20100),(40,40100)],'cal')
        self.assertEqual(c['counts_per_kg'],1000)
        self.assertEqual(weight([25100]*15,c)['kg'],25)
    def test_negative_polarity(self):
        c=fit([(0,100),(20,-19900),(40,-39900)],'cal')
        self.assertEqual(weight([-9900]*15,c)['kg'],10)
    def test_spike_filter(self):
        self.assertEqual(weight([1000]*14+[8000000],None)['raw_filtered'],1000)
    def test_uncalibrated(self): self.assertIsNone(weight([5]*15,None)['kg'])
    def test_bad_fit(self):
        with self.assertRaises(ValueError): fit([(0,0),(20,20000),(40,100)],'bad')
    def test_nonfinite_fit(self):
        with self.assertRaises(ValueError): fit([(0,0),(20,float('nan')),(40,40000)],'bad')
    def test_pressure_analytic_vector(self):
        # Synthetic trim makes P=80000+raw_p/128 and T=raw_t/1024.
        trim=struct.pack('<HHbhhbbHHbbhbb',0,2**20//1024,0,24576,16384,0,0,10000,0,0,0,0,0,0)
        p,t=compensate(trim,2560000,25600*1024)
        self.assertEqual(p,100000);self.assertEqual(t,25)
    def test_pressure_bad_trim(self):
        with self.assertRaises(ValueError): compensate(bytes(21),1,1)
    def test_audio_dc_removed(self):
        f=features(struct.pack('<32i',*([256000]*32)))
        self.assertEqual(f['rms_fs'],0);self.assertGreater(f['dc_fs'],0)
    def test_audio_rms(self):
        pcm=b''.join(struct.pack('<i',int(math.sin(2*math.pi*i/16)*0.5*(2**31-1))) for i in range(160))
        self.assertAlmostEqual(features(pcm)['rms_fs'],0.5/math.sqrt(2),places=5)

class ConfigTests(unittest.TestCase):
    def base(self): return {'epoch':'a'*32}
    def test_offline_default(self): self.assertFalse(validate(self.base())['cloud_enabled'])
    def test_epoch_required(self):
        with self.assertRaises(ValueError): validate({})
    def test_arbitrary_remote_code_rejected(self):
        with self.assertRaises(ValueError): validate(dict(self.base(),exec='bad'))
    def test_bool_interval_rejected(self):
        with self.assertRaises(ValueError): validate(dict(self.base(),sample_seconds=True))
    def test_nan_gain(self):
        with self.assertRaises(ValueError): validate(dict(self.base(),battery_gain=float('nan')))
    def test_cloud_without_product(self):
        with self.assertRaises(ValueError): validate(dict(self.base(),cloud_enabled=True))

class StorageTests(unittest.TestCase):
    def setUp(self): self.tmp=tempfile.TemporaryDirectory();self.path=self.tmp.name+'/log'
    def tearDown(self): self.tmp.cleanup()
    def record(self): return {'device_id':'test','epoch':'a'*32}
    def test_reboot_monotonic(self):
        a=Journal(self.path).append(self.record());b=Journal(self.path).append(self.record())
        self.assertNotEqual(a['event_id'],b['event_id']);self.assertEqual(b['seq'],1)
    def test_full_preserves_old(self):
        j=Journal(self.path,limit=1);j.append(self.record())
        with self.assertRaises(OSError): j.append(self.record())
        self.assertEqual(len(list(j.pending())),1)
    def test_corrupt_blocks_transfer(self):
        j=Journal(self.path);j.append(self.record())
        with open(self.path+'/'+j.names()[0],'w') as f:f.write('{}')
        with self.assertRaises(KeyError): list(j.pending())
    def test_partial_temp_ignored(self):
        j=Journal(self.path);j.append(self.record())
        Path(self.path+'/0000000001.rec.tmp').write_text('truncated')
        self.assertEqual(len(list(j.pending())),1)
    def test_cut_before_record_rename(self):
        j=Journal(self.path);real=os.rename
        def fail(a,b):
            if b.endswith('.rec'):raise OSError('injected power cut')
            return real(a,b)
        with patch('storage.os.rename',side_effect=fail):
            with self.assertRaises(OSError):j.append(self.record())
        rec=Journal(self.path).append(self.record());self.assertEqual(rec['seq'],1)
    def test_one_state_copy_bad_does_not_reuse_ack_id(self):
        j=Journal(self.path);j.append(self.record());j.ack(j.names()[0])
        Path(self.path+'/state1').write_text('broken')
        self.assertEqual(Journal(self.path).append(self.record())['seq'],1)
    def test_both_states_bad_fail_closed(self):
        j=Journal(self.path);j.append(self.record())
        for i in range(2):Path(self.path+'/state'+str(i)).write_text('broken')
        with self.assertRaises(ValueError):Journal(self.path)
    def test_ack_removes_only_selected(self):
        j=Journal(self.path);j.append(self.record());j.append(self.record());j.ack(j.names()[0])
        self.assertEqual(list(j.pending())[0][1]['seq'],1)
    def test_crc_bitflip(self):
        j=Journal(self.path);j.append(self.record());p=Path(self.path)/j.names()[0]
        p.write_text(p.read_text().replace('test','best'))
        with self.assertRaises(ValueError):list(j.pending())

class FakeUART:
    def __init__(self,mode='ok'):self.mode=mode;self.data=b'';self.written=[]
    def write(self,b):
        self.written.append(b);req=json.loads(b)
        if self.mode=='short':return 1
        if self.mode=='timeout':return len(b)
        out={'id':req['id']}
        if self.mode=='error':out['err']='storage full'
        if self.mode=='stale':self.data+=json.dumps({'id':req['id']-1}).encode()+b'\n'
        if self.mode=='noise':self.data+=b'bad json\n'
        self.data+=json.dumps(out).encode()+b'\r\n';return len(b)
    def read(self,n):
        b=self.data[:3];self.data=self.data[3:];return b or None
    def flush(self):pass

class TransportTests(unittest.TestCase):
    def test_fragmented_ack(self):self.assertIn('id',notecard.Notecard(FakeUART()).request({'req':'note.add'}))
    def test_stale_ack_ignored(self):self.assertEqual(notecard.Notecard(FakeUART('stale')).request({'req':'note.add'})['id'],2)
    def test_noise_ignored(self):self.assertEqual(notecard.Notecard(FakeUART('noise')).request({'req':'note.add'})['id'],2)
    def test_error_not_success(self):
        with self.assertRaises(OSError):notecard.Notecard(FakeUART('error')).request({'req':'note.add'})
    def test_timeout_quarantines(self):
        c=notecard.Notecard(FakeUART('timeout'))
        with self.assertRaises(OSError):c.request({'req':'note.add'},timeout_ms=10)
        self.assertTrue(c.bad)
        with self.assertRaises(OSError):c.request({'req':'card.time'})
    def test_short_write(self):
        with self.assertRaises(OSError):notecard.Notecard(FakeUART('short')).request({'req':'note.add'})
    def test_unknown_ack_keeps_journal(self):
        with tempfile.TemporaryDirectory() as d:
            j=Journal(d+'/j');r=j.append({'device_id':'t','epoch':'a'*32})
            try:
                notecard.Notecard(FakeUART('timeout')).request({'req':'note.add','body':r},timeout_ms=10)
                j.ack(j.names()[0])
            except OSError:pass
            self.assertEqual(len(list(j.pending())),1)

if __name__=='__main__':unittest.main()
