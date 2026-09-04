import {readFileSync,existsSync} from 'node:fs';
const checks=[];const add=(name,ok,detail)=>checks.push({name,ok,detail});
const major=Number(process.versions.node.split('.')[0]);add('Node.js >= 22',major>=22,process.version);add('Dependencias instaladas',existsSync('node_modules/react'),'node_modules/react');
try{const pkg=JSON.parse(readFileSync('package.json','utf8'));add('Scripts operativos',Boolean(pkg.scripts?.check&&pkg.scripts?.build),'check/build')}catch(e){add('package.json válido',false,String(e))}
add('Entrada de aplicación',existsSync('src/main.tsx'),'src/main.tsx');add('Pruebas del motor',existsSync('src/tests/evaluator.test.ts'),'src/tests');
for(const c of checks)console.log(`${c.ok?'PASS':'FAIL'}  ${c.name} (${c.detail})`);if(checks.some(c=>!c.ok))process.exitCode=1;
