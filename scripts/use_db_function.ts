
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
    console.log('=== PRODUCTION LOG SYNC (CORRECTED) ===\n');

    const todayStr = new Date().toISOString().split('T')[0];

    // First, check what tables exist
    console.log('Checking available tables...\n');

    // Try production_logs
    const { data: sampleLogs, error: logsError } = await supabase
        .from('production_logs')
        .select('*')
        .limit(1);

    console.log('production_logs table:', logsError ? `ERROR: ${logsError.message}` : 'EXISTS');

    if (sampleLogs && sampleLogs.length > 0) {
        console.log('Sample structure:', Object.keys(sampleLogs[0]));
    }

    // Get products
    const { data: products } = await supabase
        .from('products')
        .select('id, name')
        .in('name', [
            '商品A（ハンバーグ弁当）',
            '商品B（ポテトサラダ）',
            '商品C（チキン南蛮弁当）',
            '焼き魚'
        ]);

    if (!products || products.length === 0) {
        console.error('Products not found');
        return;
    }

    console.log(`\nFound ${products.length} products`);

    // Use the function that already exists in the database
    console.log('\n=== Using update_production_status function ===\n');

    const startTime = `${todayStr} 09:00:00`;
    const endTime = `${todayStr} 12:30:00`;

    for (const product of products) {
        console.log(`Processing ${product.name}...`);

        // Call the database function to update production status
        const { error } = await supabase.rpc('update_production_status', {
            p_product_id: product.id,
            p_target_date: todayStr,
            p_new_status: 'completed',
            p_actual_total: null,
            p_worker_count: 2
        });

        if (error) {
            console.error(`  ERROR: ${error.message}`);
        } else {
            console.log(`  ✓ Updated to completed with 2 workers`);
        }
    }

    // Verify
    console.log('\n=== VERIFICATION ===\n');

    const { data: logs } = await supabase
        .from('production_logs')
        .select('*')
        .eq('order_date', todayStr)
        .in('product_id', products.map(p => p.id));

    console.log(`Production logs: ${logs?.length ?? 0} records`);
    logs?.forEach(log => {
        const product = products.find(p => p.id === log.product_id);
        console.log(`  ${product?.name}: ${log.status}, ${log.worker_count} workers`);
    });

    const { data: orders } = await supabase
        .from('orders')
        .select('product_id, actual_quantity, status, worker_count')
        .eq('order_date', todayStr)
        .in('product_id', products.map(p => p.id));

    console.log(`\nOrders: ${orders?.length ?? 0} records`);
    let totalQty = 0;
    orders?.forEach(order => {
        const product = products.find(p => p.id === order.product_id);
        totalQty += order.actual_quantity || 0;
        console.log(`  ${product?.name}: ${order.actual_quantity} units, ${order.status}, ${order.worker_count} workers`);
    });

    console.log(`\n=== EXPECTED RESULTS ===`);
    console.log(`Total: ${totalQty} units`);
    console.log(`Cost: ¥7,700`);
    console.log(`Per unit: ¥${(7700 / totalQty).toFixed(2)}`);
}

main().catch(console.error);
