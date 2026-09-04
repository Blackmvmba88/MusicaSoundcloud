import {rmSync} from 'node:fs';for(const path of ['dist','coverage','tsconfig.app.tsbuildinfo'])rmSync(path,{recursive:true,force:true});
