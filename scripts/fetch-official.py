#!/usr/bin/env python3
"""Downloads TSE president BR members via HTTP ranges; CRC validated, no guessed live URL."""
import collections, csv, datetime, gzip, hashlib, io, json, pathlib, struct, sys, urllib.request, zipfile, zlib
ROOT = pathlib.Path(__file__).resolve().parents[1]
RAW = ROOT / 'dados/originais'
OUT = ROOT / 'public/data'
RAW.mkdir(parents=True, exist_ok=True)
OUT.mkdir(parents=True, exist_ok=True)
SOURCES = []
FORCE = "--refresh" in sys.argv
NOW = datetime.datetime.now(datetime.timezone.utc).isoformat()

def request(url, headers=None):
    with urllib.request.urlopen(urllib.request.Request(url, headers=headers or {}), timeout=120) as response:
        return response.read(), dict(response.headers), response.status

def record(url, path, extra=None):
    item = dict(url=url, retrievedAt=NOW, path=str(path.relative_to(ROOT)), sha256=hashlib.sha256(path.read_bytes()).hexdigest(), bytes=path.stat().st_size)
    item.update(extra or {})
    SOURCES.append(item)

def candidate_member(year):
    name = f'votacao_candidato_munzona_{year}_BR.csv'
    path = RAW / (name + '.gz')
    rawpath = RAW / name
    url = f'https://cdn.tse.jus.br/estatistica/sead/odsele/votacao_candidato_munzona/votacao_candidato_munzona_{year}.zip'
    if path.exists() and not FORCE:
        raw = gzip.decompress(path.read_bytes())
    elif rawpath.exists() and not FORCE:
        raw = rawpath.read_bytes()
        path.write_bytes(gzip.compress(raw, mtime=0))
    else:
        tail, headers, status = request(url, {'Range': 'bytes=-100000'})
        if status != 206: raise RuntimeError('Server must support validated HTTP range download')
        total = int(next(v for k,v in headers.items() if k.lower() == 'content-range').split('/')[-1])
        # Central-directory offsets adjusted automatically by zipfile against tail-only buffer.
        with zipfile.ZipFile(io.BytesIO(tail)) as archive:
            info = archive.getinfo(name)
            archive_offset = total - len(tail) + info.header_offset
        member, _, member_status = request(url, {'Range': f'bytes={archive_offset}-{archive_offset + info.compress_size + len(name) + 200}'})
        if member_status != 206 or member[:4] != b'PK\x03\x04': raise RuntimeError('Invalid local ZIP member')
        nlen, elen = struct.unpack_from('<HH', member, 26)
        raw = zlib.decompress(member[30+nlen+elen:30+nlen+elen+info.compress_size], -15)
        if len(raw) != info.file_size or (zlib.crc32(raw)&0xffffffff) != info.CRC: raise RuntimeError('ZIP CRC mismatch')
        path.write_bytes(gzip.compress(raw, mtime=0))
    record(url, path, {'member':name,'uncompressedSha256':hashlib.sha256(raw).hexdigest(),'extraction':'BR member only, ZIP CRC32 checked on first download'})
    return csv.DictReader(io.StringIO(raw.decode('latin1')), delimiter=';')

def detail_rows(year):
    url = f'https://cdn.tse.jus.br/estatistica/sead/odsele/detalhe_votacao_munzona/detalhe_votacao_munzona_{year}.zip'
    path = RAW / f'detalhe_votacao_munzona_{year}.zip'
    if FORCE or not path.exists(): path.write_bytes(request(url)[0])
    record(url,path)
    with zipfile.ZipFile(path) as archive:
        raw=archive.read(f'detalhe_votacao_munzona_{year}_BR.csv')
    return csv.DictReader(io.StringIO(raw.decode('latin1')),delimiter=';')

FIELDS={'QT_APTOS':'electorate','QT_ABSTENCOES':'abstention','QT_VOTOS_ANULADOS_APU_SEP':'annulledSeparate','QT_VOTOS_BRANCOS':'blank','QT_TOTAL_VOTOS_NULOS':'null','QT_TOTAL_VOTOS_VALIDOS':'valid','QT_COMPARECIMENTO':'turnout','QT_ELEITORES_SECOES_NAO_INSTALADAS':'notInstalledElectorate','QT_SECOES_PRINCIPAIS':'sections','QT_SECOES_AGREGADAS':'aggregatedSections','QT_SECOES_NAO_INSTALADAS':'notInstalledSections'}

def territory(id,uf,name):
    return dict(id=id,uf=uf,name=name,votes={},**{k:0 for k in FIELDS.values()},lastTotalizationAt=None)

def aggregate(items,id,uf,name):
    out=territory(id,uf,name)
    for item in items:
        for k in FIELDS.values():out[k]+=item[k]
        for k,v in item['votes'].items():out['votes'][k]=out['votes'].get(k,0)+v
        if item['lastTotalizationAt'] and (not out['lastTotalizationAt'] or item['lastTotalizationAt']>out['lastTotalizationAt']):out['lastTotalizationAt']=item['lastTotalizationAt']
    return out

NAMES={'AC':'Acre','AL':'Alagoas','AP':'Amapá','AM':'Amazonas','BA':'Bahia','CE':'Ceará','DF':'Distrito Federal','ES':'Espírito Santo','GO':'Goiás','MA':'Maranhão','MT':'Mato Grosso','MS':'Mato Grosso do Sul','MG':'Minas Gerais','PA':'Pará','PB':'Paraíba','PR':'Paraná','PE':'Pernambuco','PI':'Piauí','RJ':'Rio de Janeiro','RN':'Rio Grande do Norte','RS':'Rio Grande do Sul','RO':'Rondônia','RR':'Roraima','SC':'Santa Catarina','SP':'São Paulo','SE':'Sergipe','TO':'Tocantins','ZZ':'Exterior'}
CHECKS=[]
for year in [2026,2022,2018,2014]:
    all_votes=list(candidate_member(year));details=list(detail_rows(year))
    for round in sorted({int(r['NR_TURNO']) for r in all_votes}):
        cities={};candidates={};election_id=None
        for row in details:
            if int(row['NR_TURNO'])!=round or row['CD_CARGO']!='1':continue
            code=row['CD_MUNICIPIO'].zfill(5);key=f"{row['SG_UF']}-{code}"
            city=cities.setdefault(key,territory(key,row['SG_UF'],row['NM_MUNICIPIO']))
            city['tseCode']=code
            for a,b in FIELDS.items():city[b]+=int(row[a])
            dt=row.get('DT_ULTIMA_TOTALIZACAO','');hh=row.get('HH_ULTIMA_TOTALIZACAO','')
            if dt and hh and '/' in dt:
                dd,mm,yyyy=dt.split('/');time=f'{yyyy}-{mm}-{dd}T{hh}-03:00'
                city['lastTotalizationAt']=max(city['lastTotalizationAt'] or time,time)
        for row in all_votes:
            if int(row['NR_TURNO'])!=round or row['CD_CARGO']!='1':continue
            election_id=row['CD_ELEICAO'];code=row['CD_MUNICIPIO'].zfill(5);key=f"{row['SG_UF']}-{code}"
            if key not in cities:raise RuntimeError('Candidate municipality absent from detailed results: '+key)
            number=row['NR_CANDIDATO'];n=int(row.get('QT_VOTOS_NOMINAIS_VALIDOS',row['QT_VOTOS_NOMINAIS']))
            cities[key]['votes'][number]=cities[key]['votes'].get(number,0)+n
            c=candidates.setdefault(number,dict(number=number,name=row['NM_URNA_CANDIDATO'],party=row['SG_PARTIDO'],votes=0))
            c['votes']+=n
        states=[aggregate([c for c in cities.values() if c['uf']==uf],uf,uf,NAMES[uf]) for uf in sorted({c['uf'] for c in cities.values()})]
        national=aggregate(states,'BR','BR','Brasil')
        errors=[]
        for c in [*cities.values(),*states,national]:
            if sum(c['votes'].values())!=c['valid']:errors.append({'id':c['id'],'check':'validVotes','difference':sum(c['votes'].values())-c['valid']})
            if c['valid']+c['blank']+c['null']+c['annulledSeparate']!=c['turnout']:errors.append({'id':c['id'],'check':'turnout','difference':c['valid']+c['blank']+c['null']+c['annulledSeparate']-c['turnout']})
            if c['turnout']+c['abstention']+c['notInstalledElectorate']!=c['electorate']:errors.append({'id':c['id'],'check':'electorate','difference':c['turnout']+c['abstention']+c['notInstalledElectorate']-c['electorate']})
        data=dict(year=year,round=round,electionId=election_id,generatedAt=NOW,source='TSE Dados Abertos — votação nominal e detalhe por município/zona',candidates=sorted(candidates.values(),key=lambda c:-c['votes']),national=national,states=sorted(states,key=lambda c:-c['electorate']),cities=sorted(cities.values(),key=lambda c:c['id']),validation=dict(status='passed' if not errors else 'failed',errors=errors,cityCount=len(cities),domesticCityCount=sum(c['uf']!='ZZ' for c in cities.values()),foreignLocations=sum(c['uf']=='ZZ' for c in cities.values())))
        name='first-round-2026.json' if year==2026 else f'round-{round}-{year}.json'
        (OUT/name).write_text(json.dumps(data,ensure_ascii=False,separators=(',',':'))+'\n')
        CHECKS.append(dict(file='public/data/'+name,**data['validation'],national=national))
        print(year,round,election_id,len(cities),len(errors),national,flush=True)
        if errors and year>=2022:raise RuntimeError('Official data conservation checks failed: '+str(errors[:3]))
manifest=RAW/'downloads-manifest.json'
manifest.write_text(json.dumps(dict(checkedAt=NOW,sources=SOURCES),ensure_ascii=False,indent=2)+'\n')
reference=None
reference_path=RAW/'tse-6257.json'
if reference_path.exists():
    ref=json.loads(reference_path.read_text())
    first=next(c for c in CHECKS if c['file'].endswith('first-round-2026.json'))['national']
    expected={c['n']:int(c['vap']) for cargo in ref['carg'] if cargo['cd']=='1' for agr in cargo['agr'] for party in agr['par'] for c in party['cand']}
    comparisons={'candidateVotes':first['votes']==expected,'valid':first['valid']==int(ref['v']['vv']),'electorate':first['electorate']==int(ref['e']['te']),'abstention':first['abstention']==int(ref['e']['a']),'blank':first['blank']==int(ref['v']['vb']),'null':first['null']==int(ref['v']['tvn']),'sections':first['sections']==int(ref['s']['ts']),'notInstalledElectorate':first['notInstalledElectorate']==int(ref['e']['esni'])}
    reference={'url':'https://resultados.tse.jus.br/oficial/ele2026/6257/dados/br/br-c0001-e006257-u.jws','path':str(reference_path.relative_to(ROOT)),'comparisons':comparisons,'status':'passed' if all(comparisons.values()) else 'failed'}
    if not all(comparisons.values()):raise RuntimeError('Independent TSE national disclosure reference mismatch')
(ROOT/'dados/verification.json').write_text(json.dumps(dict(checkedAt=NOW,status='passed' if all(c['status']=='passed' for c in CHECKS) else 'partial',checks=CHECKS,independentNationalReference=reference),ensure_ascii=False,indent=2)+'\n')
files=[dict(path=str(p.relative_to(ROOT)),sha256=hashlib.sha256(p.read_bytes()).hexdigest(),bytes=p.stat().st_size) for p in sorted(RAW.rglob('*')) if p.is_file() and p.name!='files-manifest.json']
(RAW/'files-manifest.json').write_text(json.dumps(dict(createdAt=NOW,files=files),ensure_ascii=False,indent=2)+'\n')
