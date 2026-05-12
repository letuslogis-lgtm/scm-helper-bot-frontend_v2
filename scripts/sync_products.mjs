import sql from 'mssql';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Load .env from the project root
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error("Missing Supabase credentials in .env file.");
    process.exit(1);
}

// Initialize Supabase Admin Client
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const mssqlConfig = {
    user: 'gihoon_moon',
    password: 'Fursys!23#moon#gihoon',
    database: 'fgdw',
    server: '192.9.201.23',
    port: 1672,
    pool: {
        max: 10,
        min: 0,
        idleTimeoutMillis: 30000
    },
    options: {
        encrypt: false,
        trustServerCertificate: true
    }
};

const clean = (val) => val ? String(val).trim() : '';

async function syncProducts() {
    console.log(`[${new Date().toISOString()}] Starting MS-SQL to Supabase Sync...`);
    let pool;
    try {
        console.log('Connecting to MS-SQL (fgdw)...');
        pool = await sql.connect(mssqlConfig);
        
        console.log('Fetching data from [group].[DM_단품마스터+소속법인사별단품마스터]...');
        // Query only the required columns to save memory and network
        const result = await pool.request().query(`
            SELECT 
                단품코드, 
                단품색상, 
                브랜드, 
                회사, 
                공급업체, 
                생산지창고, 
                출고창고 
            FROM [group].[DM_단품마스터+소속법인사별단품마스터]
        `);
        
        const rawData = result.recordset;
        console.log(`Successfully fetched ${rawData.length} rows from MS-SQL.`);

        // Deduplicate locally just in case (same item_code & item_color, keeping the last one)
        const uniqueMap = new Map();
        rawData.forEach(row => {
            const itemCode = clean(row['단품코드']);
            const itemColor = clean(row['단품색상']);
            if (itemCode) {
                uniqueMap.set(`${itemCode}_${itemColor}`, row);
            }
        });
        
        const uniqueData = Array.from(uniqueMap.values());
        console.log(`After deduplication: ${uniqueData.length} unique items to process.`);

        let insertResult = 0;
        let updateResult = 0;
        let skipCount = 0;

        const chunkSize = 500; // Process 500 items at a time
        
        for (let i = 0; i < uniqueData.length; i += chunkSize) {
            const chunk = uniqueData.slice(i, i + chunkSize);
            const chunkItemCodes = [...new Set(chunk.map(r => clean(r['단품코드'])))];

            // Fetch existing data from Supabase for this chunk
            const { data: existingData, error: fetchError } = await supabase
                .from('products')
                .select('id, item_code, item_color, brand_category, company_division, vendor, production_line, outbound_warehouse')
                .in('item_code', chunkItemCodes);

            if (fetchError) {
                console.error(`Error fetching from Supabase at chunk ${i}:`, fetchError);
                throw fetchError;
            }

            const existingDBMap = new Map();
            existingData.forEach(row => {
                const key = `${row.item_code}_${row.item_color || ''}`.trim();
                existingDBMap.set(key, row);
            });

            const toInsert = [];
            const toUpdate = [];

            chunk.forEach(row => {
                const itemCode = clean(row['단품코드']);
                const itemColor = clean(row['단품색상']);
                const brand = clean(row['브랜드']);
                const companyDiv = clean(row['회사']);
                const vendor = clean(row['공급업체']);
                const prodLine = clean(row['생산지창고']);
                const outboundWarehouse = clean(row['출고창고']);

                const key = `${itemCode}_${itemColor}`;
                const existingRow = existingDBMap.get(key);

                if (!existingRow) {
                    toInsert.push({
                        item_code: itemCode, 
                        item_color: itemColor, 
                        brand_category: brand,
                        company_division: companyDiv, 
                        vendor: vendor, 
                        production_line: prodLine,
                        outbound_warehouse: outboundWarehouse
                    });
                } else {
                    const isBrandChanged = (existingRow.brand_category || '') !== brand;
                    const isCompanyDivChanged = (existingRow.company_division || '') !== companyDiv;
                    const isVendorChanged = (existingRow.vendor || '') !== vendor;
                    const isProdLineChanged = (existingRow.production_line || '') !== prodLine;
                    const isOutboundChanged = (existingRow.outbound_warehouse || '') !== outboundWarehouse;

                    if (isBrandChanged || isCompanyDivChanged || isVendorChanged || isProdLineChanged || isOutboundChanged) {
                        toUpdate.push({
                            id: existingRow.id, 
                            item_code: itemCode, 
                            item_color: itemColor,
                            brand_category: brand, 
                            company_division: companyDiv, 
                            vendor: vendor,
                            production_line: prodLine, 
                            outbound_warehouse: outboundWarehouse
                        });
                    } else {
                        skipCount++;
                    }
                }
            });

            // Execute Insert
            if (toInsert.length > 0) {
                const { error: insertError } = await supabase.from('products').insert(toInsert);
                if (insertError) {
                    console.error(`Insert Error at chunk ${i}:`, insertError);
                    throw insertError;
                }
                insertResult += toInsert.length;
            }

            // Execute Update (Upsert by ID)
            if (toUpdate.length > 0) {
                const { error: updateError } = await supabase.from('products').upsert(toUpdate, { onConflict: 'id' });
                if (updateError) {
                    console.error(`Update Error at chunk ${i}:`, updateError);
                    throw updateError;
                }
                updateResult += toUpdate.length;
            }

            // Log progress
            if ((i + chunkSize) % 5000 === 0 || (i + chunkSize) >= uniqueData.length) {
                console.log(`Progress: ${Math.min(i + chunkSize, uniqueData.length)} / ${uniqueData.length} items processed...`);
            }
        }

        console.log(`\n[${new Date().toISOString()}] Sync Completed Successfully!`);
        console.log(`- Total unique items: ${uniqueData.length}`);
        console.log(`- New items inserted: ${insertResult}`);
        console.log(`- Existing items updated: ${updateResult}`);
        console.log(`- Unchanged items skipped: ${skipCount}`);

    } catch (err) {
        console.error(`\n[${new Date().toISOString()}] Sync Failed:`, err);
    } finally {
        if (pool) {
            await pool.close();
        }
    }
}

syncProducts();
