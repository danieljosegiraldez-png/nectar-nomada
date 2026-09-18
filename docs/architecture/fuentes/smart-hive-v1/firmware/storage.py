"""Bounded LittleFS journal, CRC records, redundant sequence metadata.
Requires atomic rename and os.sync; never format a damaged filesystem automatically.
An interrupted record may be lost; older committed records must remain readable.
"""
import os
import json
import binascii

def sync():
    if hasattr(os,'sync'): os.sync()

def exists(path):
    try: os.stat(path); return True
    except OSError: return False

def encode(obj):
    payload=json.dumps(obj)
    return json.dumps({'payload':payload,'crc':binascii.crc32(payload.encode()) & 0xffffffff})

def decode(text):
    wrap=json.loads(text)
    if (binascii.crc32(wrap['payload'].encode()) & 0xffffffff)!=wrap['crc']:
        raise ValueError('STORAGE_CRC')
    return json.loads(wrap['payload'])

def read(path):
    with open(path) as f: return decode(f.read())

def atomic(path,obj):
    temp=path+'.tmp'
    with open(temp,'w') as f:
        f.write(encode(obj)); f.flush()
    sync()
    os.rename(temp,path)
    sync()

class State:
    def __init__(self,path):
        self.path=path; self.generation=-1; self.value={}
        valid=[]; present=False
        for slot in (0,1):
            name=path+str(slot)
            present |= exists(name)
            try:
                v=read(name); valid.append(v)
            except (OSError,ValueError,KeyError): pass
        if valid:
            winner=max(valid,key=lambda v:v['generation'])
            self.generation=winner['generation']; self.value=winner['value']
        elif present: raise ValueError('STATE_BOTH_INVALID')
    def save(self,value):
        generation=self.generation+1
        atomic(self.path+str(generation%2),{'generation':generation,'value':value})
        self.generation=generation; self.value=dict(value)
    def save_redundant(self,value):
        self.save(value)
        self.save(value)

class Journal:
    def __init__(self,path='journal',limit=240,max_bytes=2800):
        self.path,self.limit,self.max_bytes=path,limit,max_bytes
        if not exists(path): os.mkdir(path)
        self.state=State(path+'/state')
    def names(self):
        return sorted(n for n in os.listdir(self.path) if n.endswith('.rec'))
    def append(self,record):
        if len(self.names())>=self.limit: raise OSError('JOURNAL_FULL')
        # Keep spare filesystem space for metadata and recovery, before writing.
        st=os.statvfs(self.path)
        if st[0]*st[3]<65536: raise OSError('FLASH_LOW')
        seq=self.state.value.get('next',0)
        state=dict(self.state.value); state['next']=seq+1
        self.state.save_redundant(state)  # reserve ID before record becomes visible
        record=dict(record); record['seq']=seq
        record['event_id']=record['device_id']+':'+record['epoch']+':'+str(seq)
        if len(encode(record).encode())>self.max_bytes: raise ValueError('RECORD_TOO_LARGE')
        path=self.path+'/%010d.rec'%seq
        if exists(path): raise ValueError('SEQUENCE_COLLISION')
        atomic(path,record)
        return record
    def pending(self):
        for name in self.names():
            # Corrupt records block custody transfer; never silently discard them.
            yield name,read(self.path+'/'+name)
    def ack(self,name):
        if name not in self.names(): raise ValueError('BAD_ACK_NAME')
        os.remove(self.path+'/'+name)
        sync()
