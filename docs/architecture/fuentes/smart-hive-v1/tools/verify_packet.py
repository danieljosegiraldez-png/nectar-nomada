"""Structural integrity checks, not a replacement for JSON Schema validation."""
import ast,hashlib,json,re
from pathlib import Path
root=Path(__file__).resolve().parents[1]
count=0
for p in root.rglob('*.py'):
 ast.parse(p.read_text(),filename=str(p));count+=1
for p in (root/'schemas').glob('*.json'):
 data=json.loads(p.read_text())
 def walk(v):
  if isinstance(v,dict):
   if '$ref' in v:
    ref=v['$ref'];file,_,frag=ref.partition('#');target=json.loads((p.parent/file).read_text()) if file else data
    if frag:
     for token in frag.lstrip('/').split('/'):target=target[token.replace('~1','/').replace('~0','~')]
   for x in v.values():walk(x)
  elif isinstance(v,list):
   for x in v:walk(x)
 walk(data)
for p in root.rglob('*.md'):
 for link in re.findall(r'\]\(([^)]+)\)',p.read_text()):
  if '://' not in link and not link.startswith('#'):
   assert (p.parent/link.split('#')[0]).exists(),(p,link)
manifest=root/'MANIFEST.sha256'
if manifest.exists():
 for line in manifest.read_text().splitlines():
  digest,name=line.split('  ',1)
  assert hashlib.sha256((root/name).read_bytes()).hexdigest()==digest,name
print('PASS: %s Python sources parse; JSON loads; schema references and Markdown links resolve; manifest checked if present.'%count)
print('Full JSON Schema/OpenAPI standards validation not performed: optional validator unavailable in authoring environment.')
