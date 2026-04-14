const fs = require('fs');
const p = require('path');
const src = p.join(process.cwd(), 'src');

fs.readdirSync(src).filter(f => f.endsWith('.jsx')).forEach(f => {
    let raw = fs.readFileSync(p.join(src, f), 'utf8');
    if (raw.includes("import * as Recharts from 'recharts';")) {
        raw = raw.replace("import * as Recharts from 'recharts';", "import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, BarChart, Bar, XAxis, YAxis, CartesianGrid, Legend, LineChart, Line, ComposedChart, Area, AreaChart } from 'recharts';");
        fs.writeFileSync(p.join(src, f), raw);
    }
});
console.log('Fixed recharts for real 3');
