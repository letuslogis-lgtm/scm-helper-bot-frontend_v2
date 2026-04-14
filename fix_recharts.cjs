const fs = require('fs');
const p = require('path');
const src = p.join(process.cwd(), 'src');
fs.readdirSync(src).filter(f => f.endsWith('.jsx')).forEach(f => {
    let c = fs.readFileSync(p.join(src, f), 'utf8');
    if (/<(PieChart|BarChart|LineChart|ComposedChart|ResponsiveContainer)/.test(c)) {
        const rImports = ['PieChart','Pie','Cell','ResponsiveContainer','Tooltip','BarChart','Bar','XAxis','YAxis','CartesianGrid','Legend','LineChart','Line','ComposedChart','Area','AreaChart'].filter(tag => new RegExp('\\b'+tag+'\\b').test(c));
        if(rImports.length > 0 && !c.includes("from 'recharts'")) {
            c = `import { ${rImports.join(', ')} } from 'recharts';\n` + c;
            fs.writeFileSync(p.join(src, f), c);
        }
    }
});
console.log('Recharts imports fixed');
