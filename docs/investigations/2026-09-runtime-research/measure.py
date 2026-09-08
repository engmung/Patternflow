import argparse
import json
import time
import urllib.request
from pathlib import Path

p=argparse.ArgumentParser();p.add_argument('mode',choices=['download','measure']);p.add_argument('--host', required=True);a=p.parse_args()
WORK=Path(__file__).resolve().parents[3]/'_tmp/fw_research'
WORK.mkdir(parents=True, exist_ok=True)
client=urllib.request.build_opener(urllib.request.ProxyHandler({}))
last=0
def call(path,raw=False):
    global last
    time.sleep(max(0,1-(time.monotonic()-last)))
    t=time.monotonic()
    with client.open('http://'+a.host+path,timeout=15) as r: body=r.read()
    last=time.monotonic()
    return (body if raw else json.loads(body)),round((last-t)*1000,2)
catalog,_=call('/api/patterns')
lookup={p['name']:p['index'] for p in catalog['patterns']}
if a.mode=='download':
    for slug in ['branched_flow','two_stream_phase_space_vortices','wave_cascade']:
        data,_=call('/api/patterns/file?slug='+slug+'&ext=pfm',True)
        (WORK/(slug+'.pfm')).write_bytes(data)
        print(slug,len(data),flush=True)
    raise SystemExit

out=[]
def select(name):
    return call('/api/patterns/select?index='+str(lookup[name]))
def record(label,seconds=15):
    samples=[]
    started=time.monotonic()
    while time.monotonic()-started<seconds:
        status,rtt=call('/api/status');samples.append({'status':status,'rttMs':rtt})
    probe,_=call('/api/probe')
    row={'label':label,'samples':samples,'probe':probe};out.append(row)
    (WORK/'measurements.json').write_text(json.dumps(out,indent=2))
    print(json.dumps({'label':label,'active':samples[-1]['status']['active'],
                      'load':samples[-1]['status']['load'],
                      'stages':[s for s in probe['stages'] if s['n'] and s['name'] in ['loop','housekeeping','persist','featureLoop','draw','present','preview','http','disk','unload']],
                      'heap':samples[-1]['status']['heapInternal']},ensure_ascii=True),flush=True)

for name in ['Origin','Ripple Grid','Two-stream phase-space vortices']:
    select(name);time.sleep(5);call('/api/probe?reset=1&hold=0');record('steady_'+name,15)

# Counterbalanced pairs. Read/cache/save warm-up is visible in the early runs;
# retain it rather than silently removing the least flattering sample.
for name in ['Branched flow','Two-stream phase-space vortices']:
    for trial,hold in enumerate([0,1,1,0]):
        select('Ripple Grid');time.sleep(4)
        call('/api/probe?reset=1&hold='+str(hold));select(name)
        record('switch_'+name+'_hold'+str(hold)+'_'+str(trial),7)

call('/api/probe?hold=0');select('Ripple Grid')
