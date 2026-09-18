"""Bounded 9600-baud NDJSON protocol, echoed transaction IDs, no reset/power cycle.
A UART acknowledgement transfers custody to the Notecard, not to the destination API.
"""
import json
from compat import ticks_ms,ticks_diff,sleep_ms
class Notecard:
    def __init__(self,uart,feed=lambda:None,seed=1):
        self.uart,self.feed,self.serial=uart,feed,seed
        self.bad=False
    def _write(self,data):
        n=self.uart.write(data)
        if n!=len(data): self.bad=True; raise OSError('UART_SHORT_WRITE')
    def request(self,request,timeout_ms=6000):
        if self.bad: raise OSError('UART_QUARANTINED')
        self.serial+=1
        req=dict(request); req['id']=self.serial
        line=json.dumps(req).encode()+b'\n'
        if len(line)>4096: raise ValueError('UART_REQUEST_SIZE')
        # This bounded transmit can exceed WDT at larger payloads; line limit at
        # 9600 baud is <4.3s plus parsing. Feed before and after the driver call.
        self.feed(); self._write(line); self.feed()
        start=ticks_ms(); buf=bytearray()
        while ticks_diff(ticks_ms(),start)<timeout_ms:
            data=self.uart.read(128)
            if data:
                for ch in data:
                    if ch==10:
                        if buf:
                            try: obj=json.loads(buf)
                            except ValueError: obj={}
                            buf=bytearray()
                            if isinstance(obj,dict) and obj.get('id')==self.serial:
                                if 'err' in obj: raise OSError('NOTECARD:'+str(obj['err'])[:100])
                                return obj
                    elif ch!=13:
                        buf.append(ch)
                        if len(buf)>4096:
                            self.bad=True; raise ValueError('UART_RESPONSE_SIZE')
            self.feed(); sleep_ms(5)
        self.bad=True
        raise OSError('NOTECARD_TIMEOUT')
    def sleep_host(self,seconds):
        if self.bad: raise OSError('UART_QUARANTINED')
        # No response expected: host loses power. Flush filesystem before this.
        self._write(json.dumps({'cmd':'card.attn','mode':'sleep',
                                'seconds':seconds}).encode()+b'\n')
        self.uart.flush()
    def enqueue(self,record):
        return self.request({'req':'note.add','file':'hive.qo','body':record})
