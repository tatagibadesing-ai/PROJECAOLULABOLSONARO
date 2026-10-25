import { createPublicKey, verify, createHash } from 'node:crypto';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root = fileURLToPath(new URL('../', import.meta.url));
// Public verification key published by the official TSE application main.f31aece23cbbdd2d.js.
const jwk = {kty:'OKP',alg:'EdDSA',kid:'sNbt9Q_fLS65zE1_ZLNV-XRRwPY',crv:'Ed25519',x:'kWlpNHjuws1csyQZwzn3Fhzbi3RD435RbpThtSr4hMc'};
const key = createPublicKey({key:jwk,format:'jwk'});
function readSigned(relative) {
  const body=readFileSync(path.join(root,relative),'utf8').trim();
  const [header,payload,signature,...extra]=body.split('.');
  if (extra.length || !header || !payload || !signature) throw new Error('Invalid compact JWS '+relative);
  const protectedHeader=JSON.parse(Buffer.from(header,'base64url').toString());
  if (protectedHeader.alg!=='EdDSA') throw new Error('Unexpected signature algorithm');
  if (!verify(null,Buffer.from(header+'.'+payload),key,Buffer.from(signature,'base64url'))) throw new Error('Invalid official signature '+relative);
  return JSON.parse(Buffer.from(payload,'base64url').toString());
}
const data=JSON.parse(readFileSync(path.join(root,'public/data/first-round-2026.json'),'utf8'));
const comparisons=[];
for (const area of [data.national,...data.states]) {
  const scope=area.uf.toLowerCase();
  const file=scope==='br'?'dados/originais/tse-6257.jws':`dados/originais/uf-6257/${scope}.jws`;
  const official=readSigned(file);
  if (official.ele!=='6257' || official.t!=='1' || official.cdabr.toLowerCase()!==scope) throw new Error('Wrong official election or scope '+scope);
  const votes={};
  for (const cargo of official.carg.filter(c=>c.cd==='1'))
    for (const group of cargo.agr)
      for (const party of group.par)
        for (const candidate of party.cand) votes[candidate.n]=Number(candidate.vap);
  const checks={};
  for (const [candidate,total] of Object.entries(area.votes)) checks['candidate-'+candidate]=total===votes[candidate];
  for (const [local,group,key] of [['electorate','e','te'],['abstention','e','a'],['turnout','e','c'],['notInstalledElectorate','e','esni'],['valid','v','vv'],['blank','v','vb'],['null','v','tvn'],['sections','s','ts']]) checks[local]=area[local]===Number(official[group][key]);
  comparisons.push({scope:area.uf,path:file,signatureValid:true,checks,status:Object.values(checks).every(Boolean)?'passed':'failed'});
}
const report={checkedAt:new Date().toISOString(),source:'TSE unified official signed totals for national and 28 state/foreign scopes',publicKeySource:'https://resultados.tse.jus.br/oficial/app/main.f31aece23cbbdd2d.js',status:comparisons.every(c=>c.status==='passed')?'passed':'failed',comparisons};
writeFileSync(path.join(root,'dados/reconciliation.json'),JSON.stringify(report,null,2)+'\n');
for (const comparison of comparisons) console.log(comparison.scope,comparison.status,Object.entries(comparison.checks).filter(([k,v])=>!v).map(([k])=>k).join(','));
if (report.status!=='passed') process.exit(1);
