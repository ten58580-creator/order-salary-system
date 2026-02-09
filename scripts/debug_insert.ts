
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

const loadEnv = () => {
    try {
        const envPath = path.resolve(process.cwd(), '.env.local');
        const envContent = fs.readFileSync(envPath, 'utf-8');
        const env: Record<string, string> = {};
        envContent.split('\n').forEach(line => {
            const [key, value] = line.split('=');
            if (key && value) {
                env[key.trim()] = value.trim().replace(/^["']|["']$/g, '');
            }
        });
        return env;
    } catch (e) { return {}; }
};

const env = loadEnv();
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL!, env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);

async function main() {
    const todayStr = new Date().toISOString().split('T')[0];

    console.log('=== CHECKING PRODUCTION_LOGS TABLE ===\n');

    // Check if table exists and get sample data
    const { data: existingLogs, error: selectError } = await supabase
        .from('production_logs')
        .select('*')
        .limit(1);

    if (selectError) {
        console.error('ERROR querying production_logs:', selectError);
        return;
    }

    console.log('Table exists. Sample row structure:', existingLogs?.[0] ? Object.keys(existingLogs[0]) : 'No data');

    // Try inserting with minimal data
    console.log('\nTrying minimal insert...');
    const { data: products } = await supabase
        .from('products')
        .select('id, name')
        .eq('name', '商品A（ハンバーグ弁当）')
        .single();

    if (!products) {
        console.error('Product not found');
        return;
    }

    console.log('Product ID:', products.id);

    const testInsert = {
        product_id: products.id,
        order_date: todayStr,
        status: 'processing',
        start_time: `${todayStr}T09:00:00+09:00`,  // Try with timezone
        end_time: `${todayStr}T12:30:00+09:00`,
        worker_count: 2
    };

    console.log('Attempting insert with data:', JSON.stringify(testInsert, null, 2));

    const { data: inserted, error: insertError } = await supabase
        .from('production_logs')
        .insert(testInsert)
        .select();

    if (insertError) {
        console.error('\nINSERT FAILED:');
        console.error('Message:', insertError.message);
        console.error('Details:', insertError.details);
        console.error('Hint:', insertError.hint);
        console.error('Code:', insertError.code);
    } else {
        console.log('\nSUCCESS! Inserted:', inserted);
    }
}

main().catch(console.error);
