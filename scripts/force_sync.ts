
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
    console.log('=== PHYSICAL DATABASE UPDATE STARTED ===\n');

    const todayStr = new Date().toISOString().split('T')[0];
    console.log(`Target Date: ${todayStr}\n`);

    // 1. Find products
    console.log('STEP 1: Finding products...');
    const { data: products, error: prodError } = await supabase
        .from('products')
        .select('id, name')
        .in('name', ['商品A（ハンバーグ弁当）', '商品B（ポテトサラダ）', '商品C（チキン南蛮弁当）']);

    if (prodError) {
        console.error('ERROR finding products:', prodError);
        return;
    }

    if (!products || products.length === 0) {
        console.error('ERROR: Test products not found in database');
        return;
    }

    console.log(`SUCCESS: Found ${products.length} products`);
    products.forEach(p => console.log(`  - ${p.name}`));
    console.log('');

    const productIds = products.map(p => p.id);

    // 2. Delete existing production logs
    console.log('STEP 2: Deleting existing production_logs...');
    const { data: deleteData, error: deleteError, count: deleteCount } = await supabase
        .from('production_logs')
        .delete({ count: 'exact' })
        .in('product_id', productIds)
        .eq('order_date', todayStr);

    if (deleteError) {
        console.error('ERROR deleting logs:', deleteError);
    } else {
        console.log(`SUCCESS: Deleted ${deleteCount ?? 0} existing logs\n`);
    }

    // 3. Insert new production logs with correct data
    console.log('STEP 3: Creating new production_logs...');
    const startTime = `${todayStr}T09:00:00`;
    const endTime = `${todayStr}T12:30:00`;

    let insertedCount = 0;
    for (const product of products) {
        console.log(`  Attempting to insert log for ${product.name}...`);
        const insertData = {
            product_id: product.id,
            order_date: todayStr,
            status: 'processing',
            start_time: startTime,
            end_time: endTime,
            worker_count: 2
        };
        console.log(`    Data:`, JSON.stringify(insertData, null, 2));

        const { data, error } = await supabase.from('production_logs').insert(insertData).select();

        if (error) {
            console.error(`  ✗ ERROR for ${product.name}:`);
            console.error(`    Message: ${error.message}`);
            console.error(`    Details: ${error.details}`);
            console.error(`    Hint: ${error.hint}`);
            console.error(`    Code: ${error.code}`);
        } else {
            insertedCount++;
            console.log(`  ✓ ${product.name}: 09:00-12:30, 2 workers`);
        }
    }
    console.log(`SUCCESS: Inserted ${insertedCount}/${products.length} logs\n`);

    // 4. Update orders status
    console.log('STEP 4: Updating orders to completed...');
    const { data: updateData, error: updateError, count: updateCount } = await supabase
        .from('orders')
        .update({ status: 'completed' }, { count: 'exact' })
        .in('product_id', productIds)
        .eq('order_date', todayStr);

    if (updateError) {
        console.error('ERROR updating orders:', updateError);
    } else {
        console.log(`SUCCESS: Updated ${updateCount ?? 0} orders to completed\n`);
    }

    // 5. Verify final state
    console.log('STEP 5: Verifying database state...');

    const { data: logs } = await supabase
        .from('production_logs')
        .select('product_id, start_time, end_time, worker_count')
        .eq('order_date', todayStr);

    console.log(`\nProduction Logs (${logs?.length ?? 0} records):`);
    logs?.forEach(log => {
        const product = products.find(p => p.id === log.product_id);
        const start = new Date(log.start_time);
        const end = new Date(log.end_time);
        console.log(`  ${product?.name}:`);
        console.log(`    Time: ${start.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })} - ${end.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })}`);
        console.log(`    Workers: ${log.worker_count}`);
    });

    const { data: orders } = await supabase
        .from('orders')
        .select('product_id, quantity, actual_quantity, status')
        .eq('order_date', todayStr);

    console.log(`\nOrders (${orders?.length ?? 0} records):`);
    let totalQty = 0;
    orders?.forEach(order => {
        const product = products.find(p => p.id === order.product_id);
        totalQty += order.actual_quantity || 0;
        console.log(`  ${product?.name}: ${order.actual_quantity} units, status: ${order.status}`);
    });

    console.log('\n=== CALCULATION RESULTS ===');
    console.log(`Total Labor: 7.0h (3.5h × 2 workers)`);
    console.log(`Total Cost: ¥7,700`);
    console.log(`Total Production: ${totalQty} units`);
    console.log(`Average Cost/Unit: ¥${(7700 / totalQty).toFixed(2)}`);

    console.log('\n=== DATABASE UPDATE COMPLETE ===');
    console.log(`\nRECORD COUNTS:`);
    console.log(`  - Production Logs Deleted: ${deleteCount ?? 0}`);
    console.log(`  - Production Logs Inserted: ${insertedCount}`);
    console.log(`  - Orders Updated: ${updateCount ?? 0}`);
}

main().catch(console.error);
