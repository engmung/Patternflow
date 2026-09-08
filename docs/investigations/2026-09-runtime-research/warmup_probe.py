"""One-constant ELF experiment on separately named copies; originals stay intact."""
import argparse
import hashlib
import json
import struct
import time
import urllib.request
from pathlib import Path
W=Path(__file__).resolve().parents[3]/'_tmp/fw_research'
W.mkdir(parents=True, exist_ok=True)
p=argparse.ArgumentParser();p.add_argument('mode',choices=['make','run','cleanup']);p.add_argument('--host', required=True);a=p.parse_args()
CASES=[('branched_flow','research_branched','Branched flow','R Branched',0x811,b'\x72\xa0\xa0',32),
       ('two_stream_phase_space_vortices','research_twostream','Two-stream phase-space vortices','R Two-stream',0x616,b'\x52\xa0\xb4',36)]
if a.mode=='make':
    for src,slug,title,newtitle,offset,expected,count in CASES:
        data=bytearray((W/(src+'.pfm')).read_bytes())
        shoff=struct.unpack_from('<I',data,32)[0];n=struct.unpack_from('<H',data,48)[0]
        sections=[struct.unpack_from('<10I',data,shoff+40*i) for i in range(n)]
        code=next(s for s in sections if s[2]&4)
        at=code[4]+offset
        assert data[at:at+3]==expected
        assert 1<=count<128
        data[at+2]=count
        old=title.encode()+b'\0';new=newtitle.encode()+b'\0'
        assert len(new)<=len(old) and data.count(old)==1
        data=data.replace(old,new+bytes(len(old)-len(new)))
        (W/(slug+'.pfm')).write_bytes(data)
        print(json.dumps({'probe':slug,'warmup':count,'textOffset':offset,'sha256':hashlib.sha256(data).hexdigest()}))
    raise SystemExit
client=urllib.request.build_opener(urllib.request.ProxyHandler({}));last=0
def call(path,data=None,method=None,headers=None):
    global last
    time.sleep(max(0,1-(time.monotonic()-last)))
    req=urllib.request.Request('http://'+a.host+path,data=data,method=method,headers=headers or {})
    with client.open(req,timeout=20) as r:out=json.load(r)
    last=time.monotonic();return out
def index(name):
    slug=next((c[1] for c in CASES if c[3]==name),None)
    return next(p['index'] for p in call('/api/patterns')['patterns'] if p['name']==name or (slug and p.get('module')==slug))
def select(name): return call('/api/patterns/select?index='+str(index(name)))
if a.mode=='cleanup':
    select('Ripple Grid');time.sleep(4)
    for _,slug,*_ in CASES:
        print(call('/api/patterns?slug='+slug,method='DELETE'),flush=True)
    time.sleep(2);select('Ripple Grid');time.sleep(4)
    catalog=call('/api/patterns');assert len(catalog['patterns'])==11
    print('Restored original 11-pattern catalog',flush=True)
    raise SystemExit
existing={p.get('module') for p in call('/api/patterns')['patterns']}
for upload_index,(_,slug,*_) in enumerate(CASES):
    assert slug not in existing,'Probe name already exists'
    data=(W/(slug+'.pfm')).read_bytes()
    if upload_index==0:
        select('Ripple Grid');time.sleep(3);call('/api/probe?reset=1&hold=0')
        select('Two-stream phase-space vortices')
    started=time.monotonic()
    reply=call('/api/patterns',data=data,method='PUT',headers={'X-PF-Name':slug+'.pfm','Content-Type':'application/octet-stream'})
    print(reply,flush=True)
    if upload_index==0:
        result={'elapsedIncludingPacingMs':round((time.monotonic()-started)*1000),'reply':reply,'probe':call('/api/probe')}
        (W/'upload_overlap.json').write_text(json.dumps(result,indent=2))
    time.sleep(2)
results=[]
for src,slug,title,newtitle,*_ in CASES:
    for target in [title,newtitle,newtitle,title]:
        select('Ripple Grid');time.sleep(3)
        call('/api/probe?hold=0&reset=1');select(target)
        time.sleep(5)
        status=call('/api/status');assert status['active']==target and not status['loadError']
        row={'target':target,'status':status,'probe':call('/api/probe')};results.append(row)
        (W/'warmup_results.json').write_text(json.dumps(results,indent=2))
        print(json.dumps({'target':target,'setupUs':status['load']['setup'],'totalUs':status['load']['total'],'frameUs':status['frameUs']},ensure_ascii=True),flush=True)
