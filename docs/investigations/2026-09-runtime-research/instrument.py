"""Apply/restore an explicitly temporary, hash-guarded research instrumentation."""
import argparse
import base64
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
SKETCH = ROOT / 'firmware/patternflow'
WORK = ROOT / '_tmp/fw_research'
WORK.mkdir(parents=True, exist_ok=True)
MANIFEST = WORK / 'source_backup.json'
p=argparse.ArgumentParser();p.add_argument('mode',choices=['apply','restore']);a=p.parse_args()
digest=lambda b:hashlib.sha256(b).hexdigest()
if a.mode=='restore':
    records=json.loads(MANIFEST.read_text())
    for rel,r in records.items():
        path=SKETCH/rel
        assert digest(path.read_bytes())==r['patched'], 'Changed after instrumentation: '+rel
    for rel,r in records.items():
        path=SKETCH/rel
        if r['original'] is None: path.unlink()
        else: path.write_bytes(base64.b64decode(r['original']))
    MANIFEST.replace(WORK/'source_backup_restored.json')
    print('Restored the exact pre-research working files; prior improvements retained.')
    raise SystemExit
assert not MANIFEST.exists(), 'Research patch already active'
records={}
def edit(rel, replacements):
    path=SKETCH/rel; original=path.read_bytes();text=original.decode('utf-8').replace('\r\n','\n')
    for old,new in replacements:
        assert text.count(old)==1, (rel,old,text.count(old))
        text=text.replace(old,new)
    patched=text.encode('utf-8')
    records[rel]={'original':base64.b64encode(original).decode(),'patched':digest(patched)}
    return path,patched
def wrap(statement, name):
    return statement, '{ ResearchProbe::Scope probe(ResearchProbe::'+name+'); '+statement+' }'
changes=[]
changes.append(edit('patternflow.ino',[
 ('#include <Arduino.h>', '#include <Arduino.h>\n#include "src/core_research_probe.h"'),
 ('void loop() {','void loop() {\n  ResearchProbe::Scope wholeLoop(ResearchProbe::Loop);\n  const uint32_t researchHousekeepingStart = micros();'),
 wrap('PFLoopSync::service();','Sync'),wrap('serviceAsyncLoad();','Adopt'),
 wrap('PFThumbs::service();','Thumbs'),wrap('PatternflowPatternsHttp::tick();','Catalog'),
 wrap('PFFeatures::loop(frame);','FeatureLoop'),wrap('readInputFrame(input);','Input'),
 wrap('savePatternIfSettled();','Persist'),wrap('updateActivePattern(dt, input);','Update'),
 ('    drawActivePattern();\n    canvasShowsThumb = false;', '    { ResearchProbe::Scope probe(ResearchProbe::Draw); drawActivePattern(); }\n    canvasShowsThumb = false;'),
 ('bool drawPatternThumbnail(int index, bool blankIfNone) {',
  'bool drawPatternThumbnail(int index, bool blankIfNone) {\n  ResearchProbe::Scope probe(ResearchProbe::Preview);\n  if (ResearchProbe::holdPreview && currentMode == MODE_RUNNING && canvasShowsThumb) return false;'),
 ('  const uint32_t frameStartedUs = micros();','  const uint32_t frameStartedUs = micros();\n  { ResearchProbe::Scope scope(ResearchProbe::Housekeeping); scope.at = researchHousekeepingStart; }'),
]))
changes.append(edit('src/core_canvas.h',[
 ('#include <Arduino.h>','#include <Arduino.h>\n#include "core_research_probe.h"'),
 ('  uint32_t presentStartedUs = micros();','  ResearchProbe::Scope probe(ResearchProbe::Present);\n  uint32_t presentStartedUs = micros();'),
]))
changes.append(edit('src/core_net_task.h',[
 ('#include <Arduino.h>','#include <Arduino.h>\n#include "core_research_probe.h"'),
 ('    if (servicesReady) PatternflowHttp::handle();','    if (servicesReady) { ResearchProbe::Scope probe(ResearchProbe::Http); PatternflowHttp::handle(); }'),
 wrap('PFThumbs::serviceDisk();','Disk'),
]))
changes.append(edit('features/pf_features.h',[
 ('#include "pf_feature.h"','#include "pf_feature.h"\n#include "../src/core_research_probe.h"'),
 ('    if (PF_FEATURES[i]->loop) PF_FEATURES[i]->loop(frame);',
  '    if (PF_FEATURES[i]->loop) { ResearchProbe::Scope probe(ResearchProbe::Feature0+i); PF_FEATURES[i]->loop(frame); }'),
]))
changes.append(edit('src/core_module_loader.h',[
 ('inline void unload() {','inline void unload() {\n  ResearchProbe::Scope probe(ResearchProbe::Unload);'),
 ('inline bool load(fs::FS& filesystem, const char* path) {','inline bool load(fs::FS& filesystem, const char* path) {\n  ResearchProbe::Scope probe(ResearchProbe::Load);'),
]))
changes.append(edit('src/core_status_http.h',[
 ('  server().on("/api/status", HTTP_GET, handleStatus);',
  '''  server().on("/api/status", HTTP_GET, handleStatus);
  server().on("/api/probe", HTTP_GET, [] {
    if(server().hasArg("hold")) ResearchProbe::holdPreview = server().arg("hold")=="1";
    if(server().hasArg("reset")) ResearchProbe::reset();
    server().sendHeader("Cache-Control", "no-store");
    server().send(200,"application/json",ResearchProbe::json());
  });'''),
]))
rel='src/core_research_probe.h';new=(Path(__file__).resolve().parent/'probe.h').read_bytes();assert not (SKETCH/rel).exists()
records[rel]={'original':None,'patched':digest(new)};changes.append((SKETCH/rel,new))
MANIFEST.write_text(json.dumps(records,indent=2))
for path,data in changes: path.write_bytes(data)
print('Temporary profiling applied to',len(changes),'files; hash-guarded originals saved.')
