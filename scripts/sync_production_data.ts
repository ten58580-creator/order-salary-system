
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

// Helper to load env
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
    } catch (e) {
        console.error('Failed to load .env.local', e);
        return {};
    }
};

const env = loadEnv();
const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('Missing Supabase credentials in .env.local');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
    console.log('Starting Data Synchronization...');

    const todayStr = new Date().toISOString().split('T')[0];

    // 1. Update Production Logs - Set all to 2 workers and full time range (09:00-12:30)
    console.log('1. Updating production_logs with correct timestamps and worker counts...');

    const { data: products } = await supabase
        .from('products')
        .select('id, name')
        .in('name', ['商品A（ハンバーグ弁当）', '商品B（ポテトサラダ）', '商品C（チキン南蛮弁当）']);

    if (!products || products.length === 0) {
        console.error('Test products not found');
        return;
    }

    console.log('Found products:', products.map(p => p.name));

    // Delete existing logs for today
    await supabase
        .from('production_logs')
        .delete()
        .in('product_id', products.map(p => p.id))
        .eq('order_date', todayStr);

    // Create new logs with corrected data
    // All products: 2 workers, 09:00-12:30 (3.5 hours)
    const startTime = `${todayStr}T09:00:00`;
    const endTime = `${todayStr}T12:30:00`;

    for (const product of products) {
        console.log(`Creating log for ${product.name}...`);
        const { error } = await supabase.from('production_logs').insert({
            product_id: product.id,
            order_date: todayStr,
            status: 'processing',
            start_time: startTime,
            end_time: endTime,
            worker_count: 2  // 2 workers for all products
        });
        if (error) {
            console.error(`Error creating log for ${product.name}:`, error);
        }
    }

    // 2. Update Orders - Set all to 'completed' status
    console.log('2. Syncing order statuses to completed...');

    const { error: orderUpdateError } = await supabase
        .from('orders')
        .update({ status: 'completed' })
        .in('product_id', products.map(p => p.id))
        .eq('order_date', todayStr);

    if (orderUpdateError) {
        console.error('Error updating orders:', orderUpdateError);
    }

    // 3. Verify final state
    console.log('\n3. Verifying final state...');

    const { data: logs } = await supabase
        .from('production_logs')
        .select('product_id, start_time, end_time, worker_count')
        .eq('order_date', todayStr);

    console.log('\nProduction Logs:');
    logs?.forEach((log, i) => {
        const product = products.find(p => p.id === log.product_id);
        console.log(`  ${product?.name}: ${log.start_time} - ${log.end_time}, ${log.worker_count} workers`);
    });

    const { data: orders } = await supabase
        .from('orders')
        .select('product_id, quantity, actual_quantity, status')
        .eq('order_date', todayStr);

    console.log('\nOrders:');
    let totalQty = 0;
    orders?.forEach(order => {
        const product = products.find(p => p.id === order.product_id);
        console.log(`  ${product?.name}: ${order.actual_quantity} units, status: ${order.status}`);
        totalQty += order.actual_quantity || 0;
    });

    console.log('\n=== Expected Results ===');
    console.log('Total Labor Hours: 7.0h (3.5h × 2 workers)');
    console.log('Total Labor Cost: ¥7,700 (7h × ¥1,100)');
    console.log(`Total Production: ${totalQty} units`);
    console.log(`Average Cost per Unit: ¥${(7700 / totalQty).toFixed(2)}`);

    console.log('\nDone!');
}

main().catch(console.error);
