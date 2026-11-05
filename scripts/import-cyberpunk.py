"""Import the user's Foundry export. Does not execute macros or import accounts/chat/private journals.
Usage: python3 scripts/import-cyberpunk.py MODULE_DIRECTORY [UI_ATLAS]
Dependencies for reimport only: plyvel, Pillow, PyMuPDF.
"""
import sys,re,json,html,hashlib,shutil
from pathlib import Path
import plyvel,fitz
from PIL import Image
root=Path(sys.argv[1]).resolve(); repo=Path(__file__).resolve().parents[1]; dest=repo/'public/cyberpunk';dest.mkdir(exist_ok=True)
def rows(path):
 db=plyvel.DB(str(path),create_if_missing=False)
 try:return [(k.decode(),json.loads(v)) for k,v in db]
 finally:db.close()
def plain(value):return html.unescape(re.sub('<[^>]+>',' ',str(value))).strip()
files={p.name.lower():p for p in root.rglob('*') if p.suffix.lower() in ['.png','.jpg','.webp','.svg']};arts={}
def art(name,itemname=''):
 from urllib.parse import unquote
 p=files.get(Path(unquote(name)).name.lower())
 if not p and itemname:
  token=re.sub('[^a-z0-9]','',itemname.lower().split()[-1].replace('-207x',''));token={'yukimura':'yukimara'}.get(token,token)
  for f in files.values():
   base=re.sub('[^a-z0-9]','',f.stem.lower().replace('token','').replace('v2',''))
   if base==token or base==re.sub('[^a-z0-9]','',itemname.lower()):p=f;break
 if not p:return None
 if p not in arts:
  target='art-'+hashlib.sha256(str(p.relative_to(root)).encode()).hexdigest()[:12]+p.suffix.lower();shutil.copyfile(p,dest/target);arts[p]='/cyberpunk/'+target
 return arts[p]
entries=[]
for era,path in [(2045,root/'cyberpunk-red/data/items'),(2077,root/'packs/edgerunners-mission-kit')]:
 for k,v in rows(path):
  if not re.fullmatch('!items![^!]+',k) or not v.get('type'):continue
  s=v.get('system',{});entries.append(dict(id=f'{era}:{v["_id"]}',name=v['name'],type=v['type'],era=era,description=plain(s.get('description',{}).get('value','')),source=s.get('source',{}),art=art(v.get('img',''),v['name']),data={k:x for k,x in s.items() if k not in ['description','favorite','revealed','core']}))
actorrows=rows(root/'cyberpunk-red/data/actors');known={e['name'] for e in entries if e['type']=='skill'}
for k,v in actorrows:
 if v.get('type')!='skill' or v.get('name') in known:continue
 s=v.get('system',{})
 if not s.get('stat'):continue
 known.add(v['name']);entries.append(dict(id='2045:skill-'+hashlib.sha256(v['name'].encode()).hexdigest()[:16],name=v['name'],type='skill',era=2045,description=plain(s.get('description',{}).get('value','')),source=s.get('source',{}),art=None,data={k:x for k,x in s.items() if k not in ['description','favorite','level']}))
seen=set();clean=[]
for e in entries:
 key=(e['era'],e['type'],e['name'],json.dumps(e['data'],sort_keys=True))
 if key not in seen:clean.append(e);seen.add(key)
(repo/'lib/cyberpunk/catalog.generated.json').write_text(json.dumps(clean,ensure_ascii=False,separators=(',',':')))
actors=[]
for k,v in actorrows:
 if re.fullmatch('!actors![^!]+',k) and v.get('type') in ['mook','character','demon','blackIce']:
  s=v.get('system',{});actors.append(dict(id=v['_id'],name=v['name'],type=v['type'],stats=s.get('stats',{}),role=s.get('roleInfo',{}).get('activeRole',''),art=art(v.get('img','')),hp=s.get('derivedStats',{}).get('hp',{})))
(repo/'lib/cyberpunk/actors.generated.json').write_text(json.dumps(actors,ensure_ascii=False,separators=(',',':')))
# Only the d6/d10 faces used by RED; additional faces may be added without regeneration.
for sides in [6,10]:
 for n in range(1,sides+1):
  p=root/'Edgerunners Dice'/f'd{sides}-{n}.webp';d=dest/'dice';d.mkdir(exist_ok=True);shutil.copyfile(p,d/p.name)
im=Image.open(root/'Cyberpunk Edgerunners Mission Kit Digital/Individual Maps/CEMK Night City Map.jpg');im.thumbnail((2200,3000));im.save(dest/'night-city-2077.webp',quality=88)
doc=fitz.open(root/'Icones/Cyberpunk Red.pdf');page=doc[310];image=max(page.get_images(full=True),key=lambda i:i[2]*i[3]);pix=fitz.Pixmap(doc,image[0]);pix=fitz.Pixmap(fitz.csRGB,pix) if pix.colorspace.n!=3 else pix;pix.save(str(dest/'night-city-2045.png'))
s='\n'.join(doc[i].get_text() for i in range(310,316));names={int(m[1]):m[2].strip() for m in re.finditer(r'(?m)^(\d{1,2})\.\s*([^:\n]+):',s)}
coords=[(48.2,35.6),(43.2,60.7),(46.1,67.4),(50.3,58.3),(49.5,54.8),(49.2,65.1),(46.5,60.8),(41.7,55.1),(38.3,49.8),(26.7,50.8),(35.3,32.5),(31.7,39.7),(24.8,36.4),(32,35.4),(26.5,44.5),(38,43.4),(63.3,42.5),(53.2,32.2),(66,41.8),(58.4,38.8),(66.8,37.5),(41.4,14.9),(55.8,5.9),(51.8,5.4),(41.4,7.9),(39.5,3.3),(10.5,25.6),(29.8,85.5),(56.8,58.1),(60.7,52.4),(68.2,53.4),(53.4,71.3),(26.1,60.4),(34.8,59),(33.2,75.3),(92.2,92),(59.7,87),(49.4,83.9),(72.4,68.3),(73.2,17.1),(81.9,45.5),(76.1,43.1),(68.4,6.5)]
places=[]
for i,(x,y) in enumerate(coords,1):
 district='Zona Quente' if i==1 else 'Centro em Reconstrução' if i<=21 else 'Watson Development' if i<=26 else 'Morro Rock' if i==27 else 'Pacifica' if i==28 else 'Zonas de Combate' if i<=35 else 'Heywood' if i<=39 else 'New Westbrook'
 places.append(dict(id=f'2045-{i}',name=names[i],district=district,address=f'{district} · ponto {i} do mapa oficial',x=x,y=y,era=2045,precision='landmark'))
for name,d,x,y in [('Northside','Watson',51,21),('Arasaka Waterfront','Watson',29,26),('Little China','Watson',40,36),('Kabuki','Watson',51,34),('Japantown','Westbrook',60,46),('North Oak','Westbrook',78,43),('Charter Hill','Westbrook',77,56),('Downtown','City Center',28,50),('Corpo Plaza','City Center',43,55),('Wellsprings','Heywood',28,62),('The Glen','Heywood',42,64),('Vista del Rey','Heywood',56,57),('Arroyo','Santo Domingo',60,67),('Rancho Coronado','Santo Domingo',79,75),('Coastview','Pacifica',33,78),('West Wind Estate','Pacifica',24,84),('Dogtown','Pacifica',32,88)]:
 places.append(dict(id='2077-'+re.sub('[^a-z0-9]+','-',name.lower()),name=name,district=d,address=f'{name}, {d}, Night City',x=x,y=y,era=2077,precision='district'))
(repo/'lib/cyberpunk/places.generated.json').write_text(json.dumps(places,ensure_ascii=False,separators=(',',':')))
if len(sys.argv)>2:
 im=Image.open(sys.argv[2]);w,h=im.size
 for i,name in enumerate(['body-scan','neural','arm','legs','cyberdeck','street']):
  x,y=i%3,i//3;im.crop((round(x*w/3+14),round(y*h/2+14),round((x+1)*w/3-14),round((y+1)*h/2-14))).save(dest/(name+'.webp'),quality=93)
print(json.dumps({'entries':len(clean),'base':sum(e['era']==2045 for e in clean),'CEMK':sum(e['era']==2077 for e in clean),'actors':len(actors),'places':len(places),'localArt':len(arts)}))
