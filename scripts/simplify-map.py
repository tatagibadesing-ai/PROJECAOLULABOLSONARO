#!/usr/bin/env python3
"""Optional regeneration: pip install pyshp==2.3.1 shapely==2.1.2 first."""
import json, pathlib, tempfile, zipfile
import shapefile
from shapely.geometry import shape, mapping
root=pathlib.Path(__file__).resolve().parents[1]
with tempfile.TemporaryDirectory() as folder:
    with zipfile.ZipFile(root/'dados/originais/BR_UF_2022.zip') as archive:archive.extractall(folder)
    reader=shapefile.Reader(str(pathlib.Path(folder)/'BR_UF_2022.shp'),encoding='utf-8')
    features=[]
    for item in reader.iterShapeRecords():
        props=item.record.as_dict()
        features.append({'type':'Feature','id':props['SIGLA_UF'],'properties':{'id':props['SIGLA_UF'],'uf':props['SIGLA_UF'],'name':props['NM_UF'],'ibgeCode':props['CD_UF']},'geometry':mapping(shape(item.shape.__geo_interface__).simplify(0.035,preserve_topology=True))})
    (root/'public/data/states.geojson').write_text(json.dumps({'type':'FeatureCollection','source':'IBGE malha UF 2022','simplificationToleranceDegrees':0.035,'features':features},ensure_ascii=False,separators=(',',':'))+'\n')
