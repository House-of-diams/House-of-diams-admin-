// Read-only source verification. No server, network, database or fixture execution.
import fs from 'node:fs'
import crypto from 'node:crypto'
import { execFileSync } from 'node:child_process'
import ts from 'typescript'
const baseline=JSON.parse(fs.readFileSync('docs/aws-phase-b/B5-baseline.json','utf8'))
const hash=value=>crypto.createHash('sha256').update(value).digest('hex')
const changed=Object.keys(baseline).filter(file=>fs.existsSync(file)&&hash(fs.readFileSync(file))!==baseline[file])
const allowed=file=>/^app\/(api|dashboard)\/(cms|bespoke)\//.test(file)&&!file.includes('/uploads/')&&file!=='app/api/bespoke/media/route.ts'||/^lib\/(?:cms-(?!auth|direct-upload|image-upload)|bespoke-(?:hero|form)-|couples-cms|docs-admin-cache)/.test(file)||['components/blog-editor-page.tsx','components/education-editor-page.tsx','components/discover-items-editor-client.tsx'].includes(file)
for(const file of changed)if(!allowed(file))throw Error('Unexpected counterpart/source change: '+file)
const mediaFiles=['app/api/bespoke/media/route.ts','app/api/cms/uploads/about-hero/route.ts','app/api/products/media/route.ts','app/api/products/media/sign/route.ts','lib/cms-direct-upload-client.ts','lib/admin-image-upload.ts','lib/s3-media.ts','components/product-form.tsx']
for(const file of mediaFiles)if(hash(fs.readFileSync(file))!==baseline[file])throw Error('Media/counterpart source changed: '+file)
function tokens(value){value=value.replaceAll('\r\n','\n');const scanner=ts.createScanner(ts.ScriptTarget.Latest,true,ts.LanguageVariant.JSX,value);const result=[];while(scanner.scan()!==ts.SyntaxKind.EndOfFileToken)result.push(scanner.getTokenText());return JSON.stringify(result)}
function helpers(source,file){const sf=ts.createSourceFile(file,source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);const result=[]
 function visit(node){if(ts.isFunctionLike(node)&&node.body){let media=false
  function own(n){if(n!==node.body&&ts.isFunctionLike(n))return
   if(ts.isCallExpression(n)){const name=n.expression.getText(sf),arg=n.arguments[0]?.getText(sf)??''
    if(/\.storage\.|createImageBitmap|uploadCmsAsset|prepare.*Image|upload.*(?:Media|Image|Asset)/i.test(name)||name==='fetch'&&/\/api\/(?:cms\/uploads|bespoke\/media)/.test(arg))media=true
   }ts.forEachChild(n,own)}own(node.body)
  if(media)result.push({name:node.name?.getText(sf)??(ts.isVariableDeclaration(node.parent)?node.parent.name.getText(sf):'anonymous'),body:tokens(node.body.getText(sf))})
 }ts.forEachChild(node,visit)}visit(sf);return result}
const proof=[]
for(const file of changed.filter(file=>/\.[tj]sx?$/.test(file) && !file.startsWith('app/api/'))){let original
 try{original=execFileSync('git',['show',`HEAD:${file}`],{encoding:'utf8',stdio:['ignore','pipe','ignore']})}catch{continue}
 const before=helpers(original,file),after=helpers(fs.readFileSync(file,'utf8'),file)
 if(before.length!==after.length)throw Error('Changed media helper membership: '+file)
 before.forEach((entry,index)=>{if(entry.name!==after[index].name||entry.body!==after[index].body)throw Error('Changed media helper: '+file+' '+entry.name);proof.push({file,helper:entry.name,tokenSha256:hash(entry.body)})})
}
console.log(JSON.stringify({changedExistingFiles:changed.length,unchangedMediaFiles:mediaFiles.length,unchangedUploadHelpers:proof.length,proof},null,2))


