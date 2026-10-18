// Read-only C1 ownership/preservation evidence; no network, listener, configuration or live mutations.
import fs from 'node:fs'
import crypto from 'node:crypto'
import {execFileSync} from 'node:child_process'
import ts from 'typescript'
const hash=x=>crypto.createHash('sha256').update(x).digest('hex').toUpperCase()
const baseline=JSON.parse(fs.readFileSync('docs/aws-phase-c/C1-baseline.json','utf8'))
const prior=new Map(baseline.map(x=>[x.path,x.sha256]))
const clients=[
 'app/dashboard/bespoke/bespoke-client.tsx','app/dashboard/catalog/[slug]/page-client.tsx','app/dashboard/catalog/catalog-client.tsx','app/dashboard/catalog/styles/styles-client.tsx','app/dashboard/catalog/stone-shapes/stone-shapes-client.tsx',
 'components/product-form.tsx','components/blog-editor-page.tsx','components/education-editor-page.tsx','components/discover-items-editor-client.tsx','components/navbar-builder-editor.tsx','components/catalog-image-preview.tsx',
 'app/dashboard/cms/support/faq/support-faq-editor-client.tsx','app/dashboard/cms/service-banner/service-banner-editor-client.tsx','app/dashboard/cms/checkout-result/checkout-result-editor.tsx','app/dashboard/cms/summary/info/summary-info-editor.tsx','app/dashboard/cms/promotion/promotion-editor-client.tsx','app/dashboard/cms/home/hiphop-showcase/hiphop-showcase-editor-client.tsx','app/dashboard/cms/home/hiphop/hiphop-editor-client.tsx','app/dashboard/cms/home/hero/hero-editor-client.tsx','app/dashboard/cms/home/hero/slides/[slideId]/hero-slide-editor-client.tsx','app/dashboard/cms/home/collection-page/collection-page-editor-client.tsx','app/dashboard/cms/home/collection/collection-editor-client.tsx','app/dashboard/cms/home/certifications/certifications-editor-client.tsx','app/dashboard/cms/home/bestsellers/home-bestsellers-editor-client.tsx','app/dashboard/cms/about/wide-banner/about-wide-banner-editor-client.tsx','app/dashboard/cms/about/values/values-editor-client.tsx','app/dashboard/cms/about/hero/about-hero-editor-client.tsx','app/dashboard/cms/about/founders/founders-editor-client.tsx','app/dashboard/cms/education/hero/education-hero-editor-client.tsx','app/dashboard/cms/blog/hero/blog-hero-editor-client.tsx','app/dashboard/cms/contact/info/contact-info-editor-client.tsx','app/dashboard/cms/bespoke/manufacturing/bespoke-manufacturing-editor-client.tsx','app/dashboard/cms/bespoke/bespoke-showcase-editor-client.tsx',
]
const libraries=['lib/s3-media.ts','lib/admin-image-upload.ts','lib/cms-image-upload-route.ts','lib/cms-direct-upload-client.ts','lib/couples-cms.ts','lib/image-provider.ts','lib/image-route.ts','lib/image-mixed-route.ts','lib/image-transport.ts','lib/image-reference.ts','lib/image-validation.ts']
const extra=['app/api/images/provider/route.ts','scripts/test-admin-images.mjs','scripts/verify-admin-images.mjs']
const allowed=f=>clients.includes(f)||libraries.includes(f)||extra.includes(f)||/^app\/api\/cms\/uploads\/[^/]+\/(?:sign\/)?route\.ts$/.test(f)||/^app\/api\/catalog\/[^/]+\/upload\/route\.ts$/.test(f)||/^app\/api\/navbar\/(?:section-icon|featured-image)\/route\.ts$/.test(f)||/^app\/api\/(?:products\/media(?:\/sign)?|bespoke\/media|cms\/service-banner)\/route\.ts$/.test(f)
const changed=baseline.filter(x=>!fs.existsSync(x.path)||hash(fs.readFileSync(x.path))!==x.sha256).map(x=>x.path)
for(const file of changed)if(!allowed(file))throw Error('Unexpected source change: '+file)
const added=[...libraries,...extra].filter(f=>!prior.has(f))
const manifest=[...new Set([...changed,...added])].sort()
for(const file of manifest){const source=fs.readFileSync(file,'utf8');if(source.split(/\r?\n/).some(line=>/[\t ]+$/.test(line)))throw Error('Trailing whitespace: '+file)}
// Reconstruct each tracked initial source in memory from HEAD + the captured initial diff.
const initialPatch=fs.readFileSync('docs/aws-phase-c/C1-initial.patch','utf8').replaceAll('\r\n','\n')
const sections=new Map(initialPatch.split(/^diff --git /m).slice(1).map(section=>[section.split('\n')[0].match(/^a\/(.*?) b\//)[1],section]))
function initial(file){
 let head=execFileSync('git',['show','HEAD:'+file],{encoding:'utf8',stdio:['ignore','pipe','ignore']}).replaceAll('\r\n','\n')
 const section=sections.get(file);if(!section)return head
 const original=head.split('\n'),out=[];let old=0
 const lines=section.split('\n');let inHunk=false
 for(let i=1;i<lines.length;i++){const line=lines[i],match=/^@@ -(\d+)(?:,\d+)? \+\d+(?:,\d+)? @@/.exec(line)
  if(match){const start=Number(match[1])-1;out.push(...original.slice(old,start));old=start;inHunk=true;continue}
  if(!inHunk)continue
  if(line.startsWith(' ')){out.push(line.slice(1));old++}else if(line.startsWith('+'))out.push(line.slice(1));else if(line.startsWith('-'))old++;else if(line.startsWith('\\'))continue;else if(!line&&i===lines.length-1)continue;else throw Error('Unexpected patch line '+file)
 }
 out.push(...original.slice(old));return out.join('\n')
}
function matchesBaseline(source,file){return [source,source.replaceAll('\n','\r\n'),source.replace(/\n$/,''),source.replace(/\n$/,'').replaceAll('\n','\r\n')].some(x=>hash(x)===prior.get(file))}
function tokens(source){source=source.replaceAll('\r\n','\n');const scan=ts.createScanner(ts.ScriptTarget.Latest,true,ts.LanguageVariant.JSX,source),out=[];while(scan.scan()!==ts.SyntaxKind.EndOfFileToken)out.push(scan.getTokenText());return JSON.stringify(out)}
function functions(source,file){const sf=ts.createSourceFile(file,source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX),out=[]
 function visit(n){if(ts.isFunctionLike(n)&&n.body){const name=n.name?.getText(sf)??(ts.isVariableDeclaration(n.parent)?n.parent.name.getText(sf):'anonymous');const text=n.body.getText(sf);out.push({name,text,tokenHash:hash(tokens(text))})}ts.forEachChild(n,visit)}visit(sf);return out}
const preservation=[],excluded=[]
for(const file of clients.filter(f=>changed.includes(f)).concat('lib/couples-cms.ts')){
 const before=initial(file);if(!matchesBaseline(before,file))throw Error('Cannot verify reconstructed initial bytes: '+file)
 const old=functions(before,file),now=functions(fs.readFileSync(file,'utf8'),file)
 const isMedia=x=>/upload|prepare.*(?:Image|File)|Url|URL|storage|Asset/i.test(x.name)||/supabase\.auth\.getSession|supabase\.storage\./.test(x.text)
 for(const fn of old){if(fn.name==='anonymous'||isMedia(fn)||/return\s*[<(]/.test(fn.text)&&fn.text.length>15000){excluded.push({file,helper:fn.name,reason:'image/preview or enclosing JSX component'});continue}
  // Enclosing React components contain their nested upload helpers; compare their data helpers individually.
  if(/^[A-Z]/.test(fn.name)){excluded.push({file,helper:fn.name,reason:'enclosing component'});continue}
  const candidates=now.filter(x=>x.name===fn.name)
  if(!candidates.some(x=>x.tokenHash===fn.tokenHash))throw Error('Non-image helper changed: '+file+' '+fn.name)
  preservation.push({file,helper:fn.name,tokenSha256:fn.tokenHash})
 }
}
// The mixed routes keep their exact original video processing/storage tail.
const videoProof=[], mixedEndingBaseline=[]
for(const [file,start]of [['app/api/products/media/route.ts','  const extension = videoExtensions.get(file.type)'],['app/api/cms/uploads/about-hero/route.ts','  if (isS3MediaConfigured()) {']]){
 const before=initial(file),now=fs.readFileSync(file,'utf8');if(!matchesBaseline(before,file)){if(file!=='app/api/cms/uploads/about-hero/route.ts')throw Error('Cannot reconstruct '+file);mixedEndingBaseline.push({file,rawBaselineSha256:prior.get(file),normalizedReconstructedSha256:hash(before),note:'Initial Git diff normalizes mixed line endings; token proof uses that captured pre-edit diff, not a claimed raw-byte reconstruction.'})}
 const old=before.slice(before.indexOf(start)),current=now.slice(now.indexOf(start));if(tokens(old)!==tokens(current))throw Error('Video tail changed '+file);videoProof.push({file,tailTokenSha256:hash(tokens(old))})
}
const priorB6=fs.readFileSync('docs/aws-phase-b/B6-source-hashes.csv','utf8').trim().split(/\r?\n/).slice(1).map(line=>line.split(',').map(x=>x.replace(/^"|"$/g,'')))
for(const [file,sha]of priorB6)if(file&&fs.existsSync(file)&&hash(fs.readFileSync(file))!==sha.toUpperCase())throw Error('B6 source changed '+file)
fs.writeFileSync('docs/aws-phase-c/C1-source-hashes.csv','path,sha256\n'+manifest.map(f=>f+','+hash(fs.readFileSync(f))).join('\n')+'\n')
const report={baselineSources:baseline.length,changedExistingSources:changed.length,addedSources:added.length,manifestSources:manifest.length,unchangedOutsideOwnership:baseline.length-changed.length,priorB6Unchanged:priorB6.length,nonImageHelpersPreserved:preservation.length,preservation,videoProof,mixedEndingBaseline,excluded}
fs.writeFileSync('docs/aws-phase-c/C1-preservation.json',JSON.stringify(report,null,2)+'\n')
console.log(JSON.stringify({baselineSources:baseline.length,changedExistingSources:changed.length,manifestSources:manifest.length,priorB6Unchanged:priorB6.length,nonImageHelpersPreserved:preservation.length,videoTailsPreserved:videoProof.length}))
