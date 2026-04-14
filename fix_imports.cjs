const fs = require('fs');
const path = require('path');

const srcPath = path.join(process.cwd(), 'src');
const files = fs.readdirSync(srcPath).filter(f => f.endsWith('.jsx') || f.endsWith('.js'));

const exportsByFile = {};
files.forEach(f => {
    const c = fs.readFileSync(path.join(srcPath, f), 'utf8');
    const matches = c.match(/export\s+\{\s*([A-Za-z0-9_]+)\s*\}/g);
    if(matches) {
       exportsByFile[f] = matches.map(m => m.match(/export\s+\{\s*([A-Za-z0-9_]+)\s*\}/)[1]);
    } else {
       exportsByFile[f] = [];
    }
});

// useAppLogic is exported as export const useAppLogic in useAppLogic.jsx?
// No, it's export { useAppLogic }. 
// Let's also add supabase and adminSupabase
exportsByFile['supabaseClient.js'] = ['supabase', 'adminSupabase'];

files.forEach(f => {
    if(f === 'main.jsx') return; // it was manually written and is correct
    let content = fs.readFileSync(path.join(srcPath, f), 'utf8');
    let imported = new Set();
    
    const existingImports = content.match(/import\s+\{([^}]+)\}\s+from\s+['"][^'"]+['"]/g) || [];
    existingImports.forEach(ei => {
        const m = ei.match(/import\s+\{([^}]+)\}/);
        if(m) m[1].split(',').forEach(x => imported.add(x.trim()));
    });
    
    let toImport = {};
    Object.keys(exportsByFile).forEach(sourceFile => {
        if(sourceFile === f) return; 
        exportsByFile[sourceFile].forEach(comp => {
            if(imported.has(comp)) return;
            const rx = new RegExp('\\b' + comp + '\\b');
            if(rx.test(content)) {
                if(!toImport[sourceFile]) toImport[sourceFile] = [];
                toImport[sourceFile].push(comp);
            }
        });
    });
    
    let importStatements = '';
    Object.keys(toImport).forEach(sourceFile => {
        importStatements += `import { ${toImport[sourceFile].join(', ')} } from './${sourceFile}';\n`;
    });
    
    if(importStatements.length > 0) {
        // Insert after the first few imports
        let lines = content.split('\n');
        let insertIndex = 0;
        for(let i=0; i<lines.length; i++) {
            if(lines[i].startsWith('import ')) insertIndex = i + 1;
            else break;
        }
        lines.splice(insertIndex, 0, importStatements);
        fs.writeFileSync(path.join(srcPath, f), lines.join('\n'));
    }
});
console.log("✅ Imports fixed");
