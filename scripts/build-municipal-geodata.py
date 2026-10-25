#!/usr/bin/env python3
"""Build real IBGE 2025 municipal polygons using TSE's official code correspondence.
Optional regeneration dependencies: pyshp==2.3.1, shapely==2.1.2.
Runtime dashboard needs neither Python nor these packages.
"""
import concurrent.futures, csv, datetime, hashlib, io, json, math, pathlib, tempfile, threading, urllib.request, zipfile
import shapefile
import shapely
from shapely.geometry import shape, mapping
ROOT=pathlib.Path(__file__).resolve().parents[1]
RAW=ROOT/'dados/originais'
OUT=ROOT/'public/data/municipalities'
NOW=datetime.datetime.now(datetime.timezone.utc).isoformat()
MAP_URL='https://geoftp.ibge.gov.br/organizacao_do_territorio/malhas_territoriais/malhas_municipais/municipio_2025/Brasil/BR_Municipios_2025.zip'
CROSSWALK_URL='https://cdn.tse.jus.br/estatistica/sead/odsele/municipio_tse_ibge/municipio_tse_ibge.zip'
TOLERANCE=.0055
RAW.mkdir(parents=True,exist_ok=True)
OUT.mkdir(parents=True,exist_ok=True)

def fetch(url,path):
    if path.exists():return
    with urllib.request.urlopen(urllib.request.Request(url,method='HEAD'),timeout=60) as response:total=int(response.headers['Content-Length'])
    if total<10*1024*1024:
        with urllib.request.urlopen(url,timeout=120) as response:path.write_bytes(response.read())
        return
    # Range requests avoid oversized upstream transfers. TLS remains verified.
    chunk=4*1024*1024;lock=threading.Lock();partial=path.with_suffix(path.suffix+'.partial')
    with partial.open('w+b') as output:
        output.truncate(total)
        def part(start):
            end=min(start+chunk,total)-1
            request=urllib.request.Request(url,headers={'Range':f'bytes={start}-{end}'})
            with urllib.request.urlopen(request,timeout=120) as response:
                body=response.read()
                if response.status!=206 or len(body)!=end-start+1:raise RuntimeError('Invalid HTTP range response')
            with lock:output.seek(start);output.write(body)
        with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:list(pool.map(part,range(0,total,chunk)))
    partial.replace(path)

map_path=RAW/'BR_Municipios_2025.zip';crosswalk_path=RAW/'municipio_tse_ibge.zip'
fetch(MAP_URL,map_path);fetch(CROSSWALK_URL,crosswalk_path)
with zipfile.ZipFile(crosswalk_path) as archive:
    if archive.testzip():raise RuntimeError('Official code crosswalk ZIP CRC failure')
    crosswalk_csv=archive.read('municipio_tse_ibge.csv')
    (RAW/'municipio_tse_ibge.csv').write_bytes(crosswalk_csv)
    rows=list(csv.DictReader(io.StringIO(crosswalk_csv.decode('latin1')),delimiter=';'))
by_ibge={};by_tse={}
for row in rows:
    ibge=row['CD_MUNICIPIO_IBGE'];tse=f"{row['SG_UF']}-{row['CD_MUNICIPIO_TSE'].zfill(5)}"
    if ibge in by_ibge or tse in by_tse:raise RuntimeError('Official correspondence is not one-to-one')
    by_ibge[ibge]=dict(id=tse,tseCode=row['CD_MUNICIPIO_TSE'].zfill(5),ibgeCode=ibge,uf=row['SG_UF'],tseName=row['NM_MUNICIPIO_TSE'],ibgeName=row['NM_MUNICIPIO_IBGE'])
    by_tse[tse]=by_ibge[ibge]
first=json.loads((ROOT/'public/data/first-round-2026.json').read_text())
electoral_ids={c['id'] for c in first['cities'] if c['uf']!='ZZ'}
if electoral_ids!=set(by_tse):raise RuntimeError('TSE code crosswalk does not cover the current electoral dataset exactly')

excluded=[];records=[];geometries=[]
with tempfile.TemporaryDirectory(prefix='municipal-ibge-') as temporary:
    with zipfile.ZipFile(map_path) as archive:
        if archive.testzip():raise RuntimeError('IBGE municipal ZIP CRC failure')
        for name in ['BR_Municipios_2025.shp','BR_Municipios_2025.shx','BR_Municipios_2025.dbf','BR_Municipios_2025.prj']:
            archive.extract(name,temporary)
    reader=shapefile.Reader(str(pathlib.Path(temporary)/'BR_Municipios_2025.shp'),encoding='utf-8')
    for item in reader.iterShapeRecords():
        row=item.record.as_dict();cross=by_ibge.get(row['CD_MUN'])
        if not cross:
            excluded.append(dict(ibgeCode=row['CD_MUN'],name=row['NM_MUN'],reason='Absent from official TSE electoral municipality correspondence'))
            continue
        if cross['uf']!=row['SIGLA_UF']:raise RuntimeError('IBGE/TSE UF mismatch')
        geometry=shape(item.shape.__geo_interface__)
        if geometry.is_empty:raise RuntimeError('Empty official municipal geometry')
        geometries.append(geometry)
        records.append(dict(id=cross['id'],ibgeCode=cross['ibgeCode'],tseCode=cross['tseCode'],uf=cross['uf'],name=row['NM_MUN'],tseName=cross['tseName'],match='official-code-crosswalk'))
    print('Loaded official municipal polygons',len(records),flush=True)
    if {r['id'] for r in records}!=electoral_ids:raise RuntimeError('Missing municipal polygon in IBGE map')
    # Shared-edge simplification keeps neighboring municipalities on the same boundaries.
    coverage_valid=bool(shapely.coverage_is_valid(geometries))
    simplified=shapely.coverage_simplify(geometries,TOLERANCE,simplify_boundary=True) if coverage_valid else [g.simplify(TOLERANCE,preserve_topology=True) for g in geometries]
    print('Simplified polygons; input coverage valid:',coverage_valid,flush=True)

def rounded(value):
    if isinstance(value,(tuple,list)):return [rounded(item) for item in value]
    return round(value,5) if isinstance(value,float) else value
features=[]
for props,geometry in zip(records,simplified):
    if geometry.is_empty:raise RuntimeError('Simplification lost municipal geometry')
    features.append(dict(type='Feature',id=props['id'],properties=props,geometry=rounded(mapping(geometry))))
features.sort(key=lambda f:(f['properties']['name'],f['properties']['id']))
outputs=[]
for uf in ['BR',*sorted({r['uf'] for r in records})]:
    subset=features if uf=='BR' else [f for f in features if f['properties']['uf']==uf]
    payload=dict(type='FeatureCollection',sourceYear=2025,source=MAP_URL,correspondenceSource=CROSSWALK_URL,simplificationToleranceDegrees=TOLERANCE,sharedEdgeSimplification=coverage_valid,coverage=dict(total=len(subset),matched=len(subset),unmatched=0),features=subset)
    path=OUT/(uf+'.json');path.write_text(json.dumps(payload,ensure_ascii=False,separators=(',',':'))+'\n')
    outputs.append(dict(path=str(path.relative_to(ROOT)),featureCount=len(subset),bytes=path.stat().st_size,sha256=hashlib.sha256(path.read_bytes()).hexdigest()))
report=dict(checkedAt=NOW,status='passed',municipalities=len(features),crosswalkRows=len(rows),matchedElectoralIds=len(electoral_ids),unmatchedElectoralIds=[],excludedOperationalAreas=excluded,sourceYear=2025,simplificationToleranceDegrees=TOLERANCE,sharedEdgeSimplification=coverage_valid,sources=[dict(url=url,path=str(path.relative_to(ROOT)),sha256=hashlib.sha256(path.read_bytes()).hexdigest(),bytes=path.stat().st_size) for url,path in [(MAP_URL,map_path),(CROSSWALK_URL,crosswalk_path)]],outputs=outputs)
(ROOT/'dados/municipal-geodata.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
(ROOT/'dados/municipal-crosswalk.json').write_text(json.dumps(dict(source=CROSSWALK_URL,generatedAt=NOW,sourceGeneratedAt=f"{rows[0]['DT_GERACAO']} {rows[0]['HH_GERACAO']}",method='Official TSE crosswalk joining explicit TSE and IBGE codes; no name or fuzzy matching',municipalities=sorted(by_tse.values(),key=lambda x:x['id'])),ensure_ascii=False,separators=(',',':'))+'\n')
print('Municipal map ready',len(features),'features;',outputs[0]['bytes'],'bytes national',flush=True)
